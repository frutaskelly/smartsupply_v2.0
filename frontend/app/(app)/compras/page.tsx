"use client";

import { useMemo, useState } from "react";
import { Eye, PackageCheck, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import type { Almacen, OrdenCompra, Producto, Proveedor } from "@/lib/types";

const WRITE = "compra:gestionar";
const BASE = "/api/v1/ordenes-compra";

type Tone = "muted" | "warning" | "accent" | "success" | "danger";
const ESTADO: Record<string, { label: string; tone: Tone }> = {
  BORRADOR: { label: "Borrador", tone: "muted" },
  ENVIADA: { label: "Enviada", tone: "warning" },
  ACEPTADA: { label: "Aceptada", tone: "warning" },
  EN_TRANSITO: { label: "En tránsito", tone: "warning" },
  RECIBIDA_PARCIAL: { label: "Recibida parcial", tone: "accent" },
  RECIBIDA: { label: "Recibida", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "danger" },
};
const ESTADO_FILTROS = ["BORRADOR", "ENVIADA", "ACEPTADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA", "CANCELADA"];

// Transiciones "positivas" del flujo. La recepción se hace aparte con /recibir,
// que sí suma la mercancía a inventario; por eso RECIBIDA no se ofrece como
// transición simple (dejaría la orden recibida sin tocar el inventario).
const FLOW: Record<string, { to: string; label: string }[]> = {
  BORRADOR: [{ to: "ENVIADA", label: "Enviar al proveedor" }],
  ENVIADA: [{ to: "ACEPTADA", label: "Marcar aceptada" }],
  ACEPTADA: [{ to: "EN_TRANSITO", label: "Marcar en tránsito" }],
  EN_TRANSITO: [],
  RECIBIDA_PARCIAL: [],
};
const RECEIVABLE = new Set(["ENVIADA", "ACEPTADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"]);
const TERMINAL = new Set(["RECIBIDA", "CANCELADA"]);

type LineaForm = { producto_id: string; presentacion: string; cantidad: string; precio: string };
const emptyLinea = (): LineaForm => ({ producto_id: "", presentacion: "", cantidad: "1", precio: "" });

export default function ComprasPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { post } = useMutation();

  const [estado, setEstado] = useState("");
  const listPath = useMemo(() => {
    const p = new URLSearchParams({ limit: "100" });
    if (estado) p.set("estado", estado);
    return `${BASE}?${p.toString()}`;
  }, [estado]);
  const { data, loading, error, reload } = useResource<Page<OrdenCompra>>(listPath);
  const ordenes = data?.items ?? [];

  const proveedores = useResource<Page<Proveedor>>("/api/v1/proveedores?limit=200").data?.items ?? [];
  const almacenes = useResource<Page<Almacen>>("/api/v1/almacenes?limit=200").data?.items ?? [];
  const productos = useResource<Page<Producto>>("/api/v1/productos?limit=200").data?.items ?? [];
  const provName = useMemo(() => Object.fromEntries(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);
  const almName = useMemo(() => Object.fromEntries(almacenes.map((a) => [a.id, a.nombre])), [almacenes]);
  const prodName = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p.nombre])), [productos]);
  const prodById = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);

  function presentaciones(productoId: string): string[] {
    const p = prodById[productoId];
    if (!p) return [];
    const keys = Object.keys(p.presentaciones ?? {});
    const def = p.presentacion_default ?? p.unidad_base;
    return def && keys.includes(def) ? [def, ...keys.filter((k) => k !== def)] : keys;
  }
  const presentacionDefault = (productoId: string) => presentaciones(productoId)[0] ?? "";

  // ── alta ──
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [head, setHead] = useState({ proveedor_id: "", almacen_destino_id: "", fecha: "", fecha_entrega_esperada: "", notas: "" });
  const [lineas, setLineas] = useState<LineaForm[]>([emptyLinea()]);

  function openCreate() {
    const defAlm = almacenes.find((a) => a.es_default)?.id ?? almacenes[0]?.id ?? "";
    setHead({ proveedor_id: "", almacen_destino_id: defAlm, fecha: "", fecha_entrega_esperada: "", notas: "" });
    setLineas([emptyLinea()]);
    setCreating(true);
  }
  const setLinea = (i: number, patch: Partial<LineaForm>) =>
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLinea = () => setLineas((ls) => [...ls, emptyLinea()]);
  const removeLinea = (i: number) => setLineas((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const subtotal = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);

  async function saveOrden() {
    if (!head.proveedor_id) { toast.error("Elige un proveedor"); return; }
    const valid = lineas.filter((l) => l.producto_id && Number(l.cantidad) > 0);
    if (valid.length === 0) { toast.error("Agrega al menos un producto con cantidad"); return; }
    const body = {
      proveedor_id: head.proveedor_id,
      almacen_destino_id: head.almacen_destino_id || null,
      fecha: head.fecha || null,
      fecha_entrega_esperada: head.fecha_entrega_esperada || null,
      notas: head.notas || null,
      lineas: valid.map((l) => ({
        producto_id: l.producto_id,
        presentacion: l.presentacion || presentacionDefault(l.producto_id) || null,
        cantidad_solicitada: Number(l.cantidad),
        precio_unitario: Number(l.precio) || 0,
      })),
    };
    setSaving(true);
    try {
      await post(BASE, body);
      toast.success("Orden de compra creada");
      setCreating(false);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  }

  // ── detalle / acciones ──
  const [detail, setDetail] = useState<OrdenCompra | null>(null);
  const [busy, setBusy] = useState(false);
  async function openDetail(id: string) {
    try {
      setDetail(await apiFetch<OrdenCompra>(`${BASE}/${id}`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo abrir la orden");
    }
  }
  async function refreshDetail(id: string) {
    setDetail(await apiFetch<OrdenCompra>(`${BASE}/${id}`));
    reload();
  }
  async function doTransition(to: string) {
    if (!detail) return;
    setBusy(true);
    try {
      await post(`${BASE}/${detail.id}/transition`, { nuevo_estado: to });
      await refreshDetail(detail.id);
      toast.success("Estado actualizado");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar el estado");
    } finally { setBusy(false); }
  }
  async function doRecibir() {
    if (!detail) return;
    if (!window.confirm("¿Recibir todo lo pendiente y sumarlo a inventario?")) return;
    setBusy(true);
    try {
      await post(`${BASE}/${detail.id}/recibir`, {});
      await refreshDetail(detail.id);
      toast.success("Mercancía recibida y sumada a inventario");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo recibir");
    } finally { setBusy(false); }
  }

  const cols: Column<OrdenCompra>[] = [
    { header: "Folio", cell: (o) => <span className="font-medium">{o.folio ?? "—"}</span> },
    { header: "Proveedor", cell: (o) => provName[o.proveedor_id] ?? "—" },
    { header: "Fecha", cell: (o) => fmtDate(o.fecha) },
    {
      header: "Estado",
      cell: (o) => {
        const e = ESTADO[o.estado] ?? { label: o.estado, tone: "muted" as Tone };
        return <Badge tone={e.tone}>{e.label}</Badge>;
      },
    },
    { header: "Total", cell: (o) => fmtMoney(o.total_estimado), className: "text-right" },
    {
      header: "", className: "text-right w-1",
      cell: (o) => (
        <button onClick={(ev) => { ev.stopPropagation(); openDetail(o.id); }} aria-label="Ver" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
          <Eye size={16} />
        </button>
      ),
    },
  ];

  const detEstado = detail ? ESTADO[detail.estado] ?? { label: detail.estado, tone: "muted" as Tone } : null;

  return (
    <div>
      <PageHeader
        title="Compras"
        subtitle="Órdenes de compra a proveedores. Al recibir, la mercancía entra a inventario."
        actions={canWrite ? <Button onClick={openCreate}><Plus size={16} /> Nueva orden</Button> : undefined}
      />

      <div className="mb-4 max-w-xs">
        <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADO_FILTROS.map((s) => <option key={s} value={s}>{ESTADO[s].label}</option>)}
        </Select>
      </div>

      <DataTable columns={cols} rows={ordenes} loading={loading} error={error} empty="Sin órdenes de compra" onRowClick={(o) => openDetail(o.id)} />

      {/* ── Alta ── */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva orden de compra"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={saveOrden} disabled={saving}>{saving ? "Guardando…" : "Crear orden"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Proveedor" required>
            <Select value={head.proveedor_id} onChange={(e) => setHead({ ...head, proveedor_id: e.target.value })}>
              <option value="">— Elige —</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Almacén destino" hint="Donde entrará la mercancía al recibir">
            <Select value={head.almacen_destino_id} onChange={(e) => setHead({ ...head, almacen_destino_id: e.target.value })}>
              <option value="">— Elige —</option>
              {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={head.fecha} onChange={(e) => setHead({ ...head, fecha: e.target.value })} /></Field>
          <Field label="Entrega esperada"><Input type="date" value={head.fecha_entrega_esperada} onChange={(e) => setHead({ ...head, fecha_entrega_esperada: e.target.value })} /></Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Productos</span>
            <Button variant="secondary" onClick={addLinea}><Plus size={14} /> Agregar renglón</Button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-5">
                  {i === 0 && <span className="mb-1 block text-xs text-muted">Producto</span>}
                  <Select value={l.producto_id} onChange={(e) => setLinea(i, { producto_id: e.target.value, presentacion: presentacionDefault(e.target.value) })}>
                    <option value="">— Elige —</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <span className="mb-1 block text-xs text-muted">Present.</span>}
                  <Select value={l.presentacion} onChange={(e) => setLinea(i, { presentacion: e.target.value })} disabled={!l.producto_id}>
                    {presentaciones(l.producto_id).map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <span className="mb-1 block text-xs text-muted">Cantidad</span>}
                  <Input type="number" step="0.0001" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: e.target.value })} />
                </div>
                <div className="col-span-2">
                  {i === 0 && <span className="mb-1 block text-xs text-muted">Costo unit.</span>}
                  <Input type="number" step="0.0001" value={l.precio} onChange={(e) => setLinea(i, { precio: e.target.value })} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => removeLinea(i)} aria-label="Quitar" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end text-sm">
            <span className="text-muted">Subtotal estimado:&nbsp;</span><b>{fmtMoney(subtotal)}</b>
          </div>
        </div>

        <div className="mt-4">
          <Field label="Notas"><Textarea rows={2} value={head.notas} onChange={(e) => setHead({ ...head, notas: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* ── Detalle ── */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Orden ${detail.folio ?? ""}` : "Orden"}
        wide
        footer={detail ? (
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {canWrite && !TERMINAL.has(detail.estado) && (
                <Button variant="danger" disabled={busy} onClick={() => doTransition("CANCELADA")}>Cancelar orden</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDetail(null)}>Cerrar</Button>
              {canWrite && (FLOW[detail.estado] ?? []).map((t) => (
                <Button key={t.to} variant="secondary" disabled={busy} onClick={() => doTransition(t.to)}>{t.label}</Button>
              ))}
              {canWrite && RECEIVABLE.has(detail.estado) && (
                <Button disabled={busy} onClick={doRecibir}><PackageCheck size={16} /> Recibir todo</Button>
              )}
            </div>
          </div>
        ) : undefined}
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-muted">Proveedor</div>{provName[detail.proveedor_id] ?? "—"}</div>
              <div><div className="text-xs text-muted">Almacén destino</div>{detail.almacen_destino_id ? almName[detail.almacen_destino_id] ?? "—" : "—"}</div>
              <div><div className="text-xs text-muted">Fecha</div>{fmtDate(detail.fecha)}</div>
              <div><div className="text-xs text-muted">Estado</div>{detEstado && <Badge tone={detEstado.tone}>{detEstado.label}</Badge>}</div>
              <div><div className="text-xs text-muted">Entrega esperada</div>{fmtDate(detail.fecha_entrega_esperada)}</div>
              <div><div className="text-xs text-muted">Recibida</div>{fmtDate(detail.fecha_recibida)}</div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Present.</th>
                    <th className="px-3 py-2 text-right">Solicitado</th>
                    <th className="px-3 py-2 text-right">Recibido</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.lineas ?? []).map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2">{prodName[l.producto_id] ?? l.producto_id}</td>
                      <td className="px-3 py-2">{l.presentacion ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{Number(l.cantidad_solicitada)}</td>
                      <td className="px-3 py-2 text-right">{Number(l.cantidad_recibida)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(l.precio_unitario)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(l.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-6 text-sm">
              <div><span className="text-muted">Total estimado:&nbsp;</span><b>{fmtMoney(detail.total_estimado)}</b></div>
              <div><span className="text-muted">Total recibido:&nbsp;</span><b>{fmtMoney(detail.total_recibido)}</b></div>
            </div>

            {detail.notas && <p className="text-sm text-muted">{detail.notas}</p>}
            {!TERMINAL.has(detail.estado) && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <ShoppingCart size={13} /> Flujo: Borrador → Enviar → (Aceptar / En tránsito) → <b>Recibir todo</b> (entra a inventario).
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
