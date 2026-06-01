"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, FileText, Plus, Trash2, X } from "lucide-react";

import { KeyboardCombobox, type ComboOption } from "@/components/KeyboardCombobox";
import { ProductoCombobox, type ProductoPick } from "@/components/ProductoCombobox";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import type { Almacen, Cliente, Producto, Remision, RemisionDetail, Serie, Sucursal } from "@/lib/types";

const WRITE = "remision:gestionar";

const ESTADO_TONE: Record<string, "success" | "warning" | "muted" | "danger"> = {
  BORRADOR: "warning",
  CONFIRMADA: "success",
  CANCELADA: "danger",
};

type LineaForm = {
  key: string;
  texto: string;            // lo que se mostró/pegó (para aprender alias / revisar)
  producto_id: string;
  label: string;            // "sku · nombre" cuando hay producto
  presentacion: string;
  presentaciones: string[];
  cantidad: string;
  precio: string;           // vacío = se resuelve en backend
  precioManual: boolean;
  importe: number;
};

let _seq = 0;
const nuevaLinea = (over: Partial<LineaForm> = {}): LineaForm => ({
  key: `l${_seq++}`,
  texto: "",
  producto_id: "",
  label: "",
  presentacion: "KILO",
  presentaciones: [],
  cantidad: "1",
  precio: "",
  precioManual: false,
  importe: 0,
  ...over,
});

export default function RemisionesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { post, loading: saving } = useMutation();

  // catálogos
  const clientesRes = useResource<Page<Cliente>>("/api/v1/clientes?limit=200");
  const almacenesRes = useResource<Page<Almacen>>("/api/v1/almacenes?limit=200");
  const productosRes = useResource<Page<Producto>>("/api/v1/productos?limit=1000");
  const clientes = clientesRes.data?.items ?? [];
  const almacenes = almacenesRes.data?.items ?? [];
  const productos = productosRes.data?.items ?? [];
  const prodById = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);
  const cliName = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.legal_name])), [clientes]);

  // lista
  const [fEstado, setFEstado] = useState("");
  const [fCliente, setFCliente] = useState("");
  const listPath = useMemo(() => {
    const p = new URLSearchParams({ limit: "50" });
    if (fEstado) p.set("estado", fEstado);
    if (fCliente) p.set("cliente_id", fCliente);
    return `/api/v1/remisiones?${p.toString()}`;
  }, [fEstado, fCliente]);
  const { data, loading, error, reload } = useResource<Page<Remision>>(listPath);
  const rows = data?.items ?? [];

  // modo crear
  const [mode, setMode] = useState<"list" | "create">("list");
  const [clienteId, setClienteId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [fecha, setFecha] = useState("");
  const [serieOverride, setSerieOverride] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  // paso del flujo por teclado: cuál caja se auto-abre/enfoca
  const [step, setStep] = useState<"cliente" | "sucursal" | "almacen" | "serie" | "lineas" | null>(null);

  // series de remisión (para override) + preview de la serie que aplicaría
  const seriesRemRes = useResource<Page<Serie>>("/api/v1/series?tipo_documento=REMISION&activa=true&limit=200");
  const seriesRem = seriesRemRes.data?.items ?? [];
  const [serieResuelta, setSerieResuelta] = useState<Serie | null>(null);
  useEffect(() => {
    if (mode !== "create" || !clienteId) { setSerieResuelta(null); return; }
    const p = new URLSearchParams({ tipo_documento: "REMISION", cliente_id: clienteId });
    if (sucursalId) p.set("sucursal_id", sucursalId);
    if (serieOverride) p.set("serie_id", serieOverride);
    apiFetch<Serie | null>(`/api/v1/series/resolver?${p.toString()}`)
      .then(setSerieResuelta)
      .catch(() => setSerieResuelta(null));
  }, [mode, clienteId, sucursalId, serieOverride]);

  const folioPreview = serieResuelta ? `${serieResuelta.codigo}${serieResuelta.folio_actual + 1}` : "—";
  const totalPreview = lineas.reduce((s, l) => s + (l.importe || 0), 0);

  // opciones para los comboboxes
  const clienteOpts: ComboOption[] = useMemo(() => clientes.map((c) => ({ value: c.id, label: c.legal_name })), [clientes]);
  const sucursalOpts: ComboOption[] = useMemo(() => sucursales.map((s) => ({ value: s.id, label: s.nombre })), [sucursales]);
  const almacenOpts: ComboOption[] = useMemo(() => almacenes.map((a) => ({ value: a.id, label: a.nombre })), [almacenes]);
  const serieOpts: ComboOption[] = useMemo(
    () => [
      { value: "", label: `Automática${serieResuelta ? ` · ${serieResuelta.codigo}` : ""}` },
      ...seriesRem.map((s) => ({ value: s.id, label: `${s.codigo}${s.nombre ? ` · ${s.nombre}` : ""}` })),
    ],
    [seriesRem, serieResuelta],
  );

  const today = () => new Date().toISOString().slice(0, 10);

  // Avanza al siguiente campo saltando los que tienen 0 o 1 opción (auto-selección).
  function resolveFrom(target: "sucursal" | "almacen" | "serie" | "lineas", sucs = sucursales, alms = almacenes) {
    if (target === "sucursal") {
      if (sucs.length === 0) { setSucursalId(""); return resolveFrom("almacen", sucs, alms); }
      if (sucs.length === 1) { setSucursalId(sucs[0].id); return resolveFrom("almacen", sucs, alms); }
      return setStep("sucursal");
    }
    if (target === "almacen") {
      if (alms.length === 0) { setAlmacenId(""); return resolveFrom("serie", sucs, alms); }
      if (alms.length === 1) { setAlmacenId(alms[0].id); return resolveFrom("serie", sucs, alms); }
      return setStep("almacen");
    }
    if (target === "serie") {
      if (!fecha) setFecha(today());
      return setStep("serie");
    }
    setStep("lineas");
    setLineFocus({ key: lineas[0]?.key, field: "producto" });   // enfoca la primera línea
  }

  async function selectCliente(v: string) {
    setClienteId(v);
    setStep(null);
    const cli = clientes.find((c) => c.id === v);
    setSerieOverride(cli?.serie_remision_id ?? "");   // la serie del cliente se aplica sola
    let sucs: Sucursal[] = [];
    try {
      sucs = (await apiFetch<Page<Sucursal>>(`/api/v1/sucursales?cliente_id=${v}&limit=200`)).items;
    } catch {
      sucs = [];
    }
    setSucursales(sucs);
    resolveFrom("sucursal", sucs);
  }

  function openCreate() {
    setClienteId(""); setSucursalId(""); setAlmacenId(""); setSerieOverride("");
    setSucursales([]); setNotas(""); setLineas([nuevaLinea()]);
    setFecha(today());            // fecha de hoy por defecto (el flujo la salta)
    setMode("create");
    setStep("cliente");           // arranca con el cliente abierto
  }

  function setLinea(key: string, patch: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // ── foco encadenado dentro de las líneas (producto → presentación → cantidad → precio → siguiente) ──
  type LineField = "producto" | "presentacion" | "cantidad" | "precio";
  const [lineFocus, setLineFocus] = useState<{ key: string; field: LineField } | null>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => {
    if (!lineFocus) return;
    if (lineFocus.field === "cantidad" || lineFocus.field === "precio") {
      const el = cellRefs.current[`${lineFocus.key}:${lineFocus.field}`];
      el?.focus();
      el?.select();
    }
  }, [lineFocus]);

  function advanceLine(key: string, from: LineField) {
    if (from === "producto") return setLineFocus({ key, field: "presentacion" });
    if (from === "presentacion") return setLineFocus({ key, field: "cantidad" });
    if (from === "cantidad") return setLineFocus({ key, field: "precio" });
    // precio → siguiente línea (o crea una nueva si es la última)
    const idx = lineas.findIndex((l) => l.key === key);
    if (idx === lineas.length - 1) {
      const nl = nuevaLinea();
      setLineas((ls) => [...ls, nl]);
      return setLineFocus({ key: nl.key, field: "producto" });
    }
    return setLineFocus({ key: lineas[idx + 1].key, field: "producto" });
  }

  async function cotizar(key: string, producto_id: string, presentacion: string, cantidad: string) {
    if (!producto_id || !Number(cantidad)) return;
    try {
      const p = new URLSearchParams({ producto_id, presentacion, cantidad });
      if (clienteId) p.set("cliente_id", clienteId);
      if (sucursalId) p.set("sucursal_id", sucursalId);
      const r = await apiFetch<{ precio: string | null }>(`/api/v1/precios/cotizar?${p.toString()}`);
      setLineas((ls) =>
        ls.map((l) => {
          if (l.key !== key) return l;
          if (l.precioManual) return { ...l, importe: Number(l.precio || 0) * Number(cantidad) };
          const precio = r.precio ?? "";
          return { ...l, precio: precio === "" ? "" : String(precio), importe: Number(precio || 0) * Number(cantidad) };
        }),
      );
    } catch {
      /* sin precio: se resolverá al guardar */
    }
  }

  function onPickProducto(key: string, pick: ProductoPick | null, texto: string) {
    if (!pick) {
      setLinea(key, { producto_id: "", label: "", texto });
      return;
    }
    const prod = prodById[pick.producto_id];
    const pres = prod ? Object.keys(prod.presentaciones ?? {}) : [];
    const def = prod?.presentacion_default ?? prod?.unidad_base ?? pres[0] ?? "KILO";
    const presentacion = pres.includes(def) ? def : pres[0] ?? "KILO";
    setLinea(key, {
      producto_id: pick.producto_id,
      label: `${pick.sku} · ${pick.nombre}`,
      texto,
      presentaciones: pres,
      presentacion,
    });
    const ln = lineas.find((l) => l.key === key);
    cotizar(key, pick.producto_id, presentacion, ln?.cantidad ?? "1");
    setLineFocus({ key, field: "presentacion" });   // Enter en producto → presentación
  }

  // ── pegar como Excel ──
  const [pasteText, setPasteText] = useState("");
  async function procesarPaste() {
    const filas = pasteText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.split("\t").map((c) => c.trim()));
    if (filas.length === 0) return;
    const textos = filas.map((c) => c[0]);
    let matches: { texto: string; candidatos: { producto_id: string; sku: string; nombre: string; score: number; origen: string }[] }[] = [];
    try {
      matches = await apiFetch("/api/v1/productos/match", {
        method: "POST",
        body: JSON.stringify({ textos, usar_ia: false, limit: 1 }),
      });
    } catch {
      matches = [];
    }
    const nuevas: LineaForm[] = filas.map((cols, i) => {
      const texto = cols[0];
      const cantidad = cols[1] && Number(cols[1].replace(",", ".")) ? cols[1].replace(",", ".") : "1";
      const presIn = cols[2] || "";
      const top = matches[i]?.candidatos?.[0];
      const auto = top && (top.origen === "exacto" || top.origen === "alias" || top.score >= 85) ? top : null;
      if (auto) {
        const prod = prodById[auto.producto_id];
        const presKeys = prod ? Object.keys(prod.presentaciones ?? {}) : [];
        const def = prod?.presentacion_default ?? prod?.unidad_base ?? presKeys[0] ?? "KILO";
        const presentacion = presIn && presKeys.includes(presIn) ? presIn : presKeys.includes(def) ? def : presKeys[0] ?? "KILO";
        return nuevaLinea({
          texto, producto_id: auto.producto_id, label: `${auto.sku} · ${auto.nombre}`,
          presentaciones: presKeys, presentacion, cantidad,
        });
      }
      return nuevaLinea({ texto, cantidad, presentacion: presIn || "KILO" }); // sin resolver → el usuario confirma
    });
    setLineas((ls) => {
      const base = ls.filter((l) => l.producto_id || l.texto);
      return [...base, ...nuevas];
    });
    // cotizar las que sí resolvieron
    nuevas.forEach((l) => l.producto_id && cotizar(l.key, l.producto_id, l.presentacion, l.cantidad));
    setPasteText("");
    setPasteOpen(false);
    toast.success(`${nuevas.length} líneas agregadas`);
  }

  async function guardar() {
    if (!clienteId) { toast.error("Elige un cliente"); return; }
    const lns = lineas.filter((l) => l.producto_id && Number(l.cantidad) > 0);
    if (lns.length === 0) { toast.error("Agrega al menos una línea con producto y cantidad"); return; }
    const payload = {
      cliente_facturacion_id: clienteId,
      sucursal_id: sucursalId || null,
      almacen_id: almacenId || null,
      serie_id: serieOverride || null,
      fecha_remision: fecha || null,
      notas: notas || null,
      lineas: lns.map((l) => ({
        producto_id: l.producto_id,
        presentacion: l.presentacion,
        cantidad_solicitada: l.cantidad,
        precio_unitario: l.precioManual && l.precio ? l.precio : undefined,
      })),
    };
    try {
      const rem = await apiFetch<RemisionDetail>("/api/v1/remisiones", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(`Remisión ${rem.folio_interno} creada`);
      setMode("list");
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear la remisión");
    }
  }

  // ── acciones de lista ──
  const [detalle, setDetalle] = useState<RemisionDetail | null>(null);
  const [toConfirm, setToConfirm] = useState<Remision | null>(null);
  const [toCancel, setToCancel] = useState<Remision | null>(null);

  async function verDetalle(r: Remision) {
    try {
      const d = await apiFetch<RemisionDetail>(`/api/v1/remisiones/${r.id}`);
      setDetalle(d);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar");
    }
  }
  async function confirmar() {
    if (!toConfirm) return;
    try {
      await post(`/api/v1/remisiones/${toConfirm.id}/confirmar`, {});
      toast.success("Remisión confirmada (stock reservado)");
      setToConfirm(null); reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo confirmar");
    }
  }
  async function cancelar() {
    if (!toCancel) return;
    try {
      await post(`/api/v1/remisiones/${toCancel.id}/cancelar`, {});
      toast.success("Remisión cancelada");
      setToCancel(null); reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cancelar");
    }
  }

  const columns: Column<Remision>[] = [
    { header: "Folio", cell: (r) => <span className="font-medium">{r.folio_interno}</span> },
    { header: "Cliente", cell: (r) => cliName[r.cliente_facturacion_id] ?? "—" },
    { header: "Fecha", cell: (r) => fmtDate(r.fecha_remision) },
    { header: "Estado", cell: (r) => <Badge tone={ESTADO_TONE[r.estado] ?? "muted"}>{r.estado}</Badge> },
    { header: "Total", cell: (r) => fmtMoney(r.total), className: "text-right" },
    {
      header: "",
      className: "text-right w-1",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => verDetalle(r)} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground">Ver</button>
          {canWrite && r.estado === "BORRADOR" && (
            <button onClick={() => setToConfirm(r)} className="rounded-md px-2 py-1 text-xs text-success hover:bg-surface-2">Confirmar</button>
          )}
          {canWrite && r.estado !== "CANCELADA" && (
            <button onClick={() => setToCancel(r)} className="rounded-md px-2 py-1 text-xs text-danger hover:bg-surface-2">Cancelar</button>
          )}
        </div>
      ),
    },
  ];

  // ───────────────────────── render ─────────────────────────
  if (mode === "create") {
    return (
      <div>
        <PageHeader
          title="Nueva remisión"
          subtitle="Borrador — al confirmar se reserva el inventario"
          actions={<Button variant="secondary" onClick={() => setMode("list")}><X size={16} /> Cancelar</Button>}
        />

        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cliente" required hint="Escribe y usa ↑/↓ · Enter para seleccionar y avanzar">
            <KeyboardCombobox
              options={clienteOpts}
              value={clienteId}
              onSelect={(v) => selectCliente(v)}
              autoOpen={step === "cliente"}
              placeholder="Buscar cliente…"
              emptyText="Sin clientes"
            />
          </Field>
          <Field label="Sucursal">
            <KeyboardCombobox
              options={sucursalOpts}
              value={sucursalId}
              onSelect={setSucursalId}
              onAdvance={() => resolveFrom("almacen")}
              autoOpen={step === "sucursal"}
              placeholder="(matriz / sin sucursal)"
              emptyText="Sin sucursales"
              disabled={!clienteId}
            />
          </Field>
          <Field label="Almacén">
            <KeyboardCombobox
              options={almacenOpts}
              value={almacenId}
              onSelect={setAlmacenId}
              onAdvance={() => resolveFrom("serie")}
              autoOpen={step === "almacen"}
              placeholder="Sin almacén"
              emptyText="Sin almacén"
            />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Serie">
            <KeyboardCombobox
              options={serieOpts}
              value={serieOverride}
              onSelect={setSerieOverride}
              onAdvance={() => resolveFrom("lineas")}
              autoOpen={step === "serie"}
              placeholder="Serie…"
            />
          </Field>
          <Field label="Consecutivo (informativo)">
            <Input value={folioPreview} readOnly disabled aria-label="Folio consecutivo" />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Líneas</h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPasteOpen(true)}><ClipboardPaste size={16} /> Pegar de Excel</Button>
              <Button variant="secondary" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}><Plus size={16} /> Línea</Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="hidden grid-cols-12 gap-2 px-1 text-xs text-muted sm:grid">
              <div className="col-span-5">Producto</div>
              <div className="col-span-2">Presentación</div>
              <div className="col-span-2">Cantidad</div>
              <div className="col-span-2">Precio</div>
              <div className="col-span-1 text-right">Importe</div>
            </div>
            {lineas.map((l) => (
              <div key={l.key} className="grid grid-cols-12 items-start gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <ProductoCombobox
                    label={l.label || l.texto}
                    onSelect={(p, t) => onPickProducto(l.key, p, t)}
                    autoFocus={lineFocus?.key === l.key && lineFocus?.field === "producto"}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <KeyboardCombobox
                    options={(l.presentaciones.length ? l.presentaciones : [l.presentacion]).map((p) => ({ value: p, label: p }))}
                    value={l.presentacion}
                    onSelect={(v) => { setLinea(l.key, { presentacion: v }); cotizar(l.key, l.producto_id, v, l.cantidad); }}
                    onAdvance={() => advanceLine(l.key, "presentacion")}
                    autoOpen={lineFocus?.key === l.key && lineFocus?.field === "presentacion"}
                    placeholder="Presentación"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    inputMode="decimal" value={l.cantidad}
                    ref={(el) => { cellRefs.current[`${l.key}:cantidad`] = el; }}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); setLinea(l.key, { cantidad: v, importe: Number(l.precio || 0) * Number(v || 0) }); cotizar(l.key, l.producto_id, l.presentacion, v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); advanceLine(l.key, "cantidad"); } }}
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    inputMode="decimal" placeholder="auto" value={l.precio}
                    ref={(el) => { cellRefs.current[`${l.key}:precio`] = el; }}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); setLinea(l.key, { precio: v, precioManual: true, importe: Number(v || 0) * Number(l.cantidad || 0) }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); advanceLine(l.key, "precio"); } }}
                  />
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                  <span className="text-sm tabular-nums">{fmtMoney(l.importe)}</span>
                  <button aria-label="Quitar línea" onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} className="text-muted hover:text-danger"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>

          <Field label="Notas">
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Field>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted">Total estimado</span>
            <div className="flex items-center gap-4">
              <span className="text-lg font-semibold tabular-nums">{fmtMoney(totalPreview)}</span>
              <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar borrador"}</Button>
            </div>
          </div>
        </div>

        <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Pegar líneas desde Excel"
          footer={<><Button variant="secondary" onClick={() => setPasteOpen(false)}>Cancelar</Button><Button onClick={procesarPaste}>Procesar</Button></>}>
          <p className="mb-2 text-sm text-muted">Pega columnas separadas por tabulador: <strong>producto, cantidad, presentación</strong> (una fila por línea). El sistema cruza cada producto automáticamente.</p>
          <Textarea rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"zanahoria\t10\tKILO\njitomate\t5\tKILO"} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Remisiones"
        subtitle="Notas de entrega (no fiscales)"
        actions={canWrite ? <Button onClick={openCreate}><Plus size={16} /> Nueva remisión</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="max-w-[10rem]">
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="CONFIRMADA">Confirmada</option>
          <option value="CANCELADA">Cancelada</option>
        </Select>
        <Select value={fCliente} onChange={(e) => setFCliente(e.target.value)} className="max-w-xs">
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} error={error} empty="Sin remisiones" />

      {/* detalle */}
      <Modal open={detalle !== null} onClose={() => setDetalle(null)} title={detalle ? `Remisión ${detalle.folio_interno}` : ""} wide
        footer={<Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>}>
        {detalle && (
          <div>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <div><span className="text-muted">Cliente:</span> {cliName[detalle.cliente_facturacion_id] ?? "—"}</div>
              <div><span className="text-muted">Fecha:</span> {fmtDate(detalle.fecha_remision)}</div>
              <div><span className="text-muted">Estado:</span> <Badge tone={ESTADO_TONE[detalle.estado] ?? "muted"}>{detalle.estado}</Badge></div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-1">Producto</th><th>Pres.</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Importe</th>
              </tr></thead>
              <tbody>
                {detalle.lineas.map((l) => (
                  <tr key={l.id} className="border-b border-border/50">
                    <td className="py-1">{prodById[l.producto_id]?.nombre ?? l.producto_id}</td>
                    <td>{l.presentacion}</td>
                    <td className="text-right tabular-nums">{fmtNumber(l.cantidad_solicitada)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.precio_unitario)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end gap-4 text-sm">
              <span className="text-muted">Total</span><span className="font-semibold tabular-nums">{fmtMoney(detalle.total)}</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={toConfirm !== null} title="Confirmar remisión"
        message={`¿Confirmar ${toConfirm?.folio_interno}? Se reservará el inventario.`}
        onConfirm={confirmar} onClose={() => setToConfirm(null)} loading={saving} />
      <ConfirmDialog open={toCancel !== null} title="Cancelar remisión"
        message={`¿Cancelar ${toCancel?.folio_interno}? Se liberará el inventario reservado.`}
        onConfirm={cancelar} onClose={() => setToCancel(null)} loading={saving} />
    </div>
  );
}
