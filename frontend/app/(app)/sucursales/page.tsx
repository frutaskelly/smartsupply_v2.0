"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Calculator, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import type { Cliente, Cotizacion, ListaPrecios, PrecioOverride, Producto, Serie, Sucursal } from "@/lib/types";

const WRITE_SUC = "cliente:gestionar";
const WRITE_OVR = "lista_precios:gestionar";

const ORIGEN_LABEL: Record<string, string> = {
  override_sucursal: "Precio especial de la sucursal",
  override_cliente: "Precio especial del cliente",
  lista_sucursal: "Lista de la sucursal",
  lista_cliente: "Lista del cliente",
  lista_base: "Lista base (público)",
};

export default function SucursalesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canSuc = can(me, WRITE_SUC);
  const canOvr = can(me, WRITE_OVR);
  const { post, del } = useMutation();

  const clientesRes = useResource<Page<Cliente>>("/api/v1/clientes?limit=200");
  const productosRes = useResource<Page<Producto>>("/api/v1/productos?limit=200");
  const listasRes = useResource<Page<ListaPrecios>>("/api/v1/listas-precios?limit=200");
  const seriesFacRes = useResource<Page<Serie>>("/api/v1/series?tipo_documento=FACTURA&activa=true&limit=200");
  const seriesRemRes = useResource<Page<Serie>>("/api/v1/series?tipo_documento=REMISION&activa=true&limit=200");
  const clientes = clientesRes.data?.items ?? [];
  const productos = productosRes.data?.items ?? [];
  const listas = listasRes.data?.items ?? [];
  const seriesFac = seriesFacRes.data?.items ?? [];
  const seriesRem = seriesRemRes.data?.items ?? [];
  const prodName = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p.nombre])), [productos]);
  const listaName = useMemo(() => Object.fromEntries(listas.map((l) => [l.id, l.nombre])), [listas]);
  const prodById = useMemo(() => Object.fromEntries(productos.map((p) => [p.id, p])), [productos]);

  // Presentaciones válidas de un producto (con su default al frente). El precio
  // se guarda por presentación, así que cotizar con una que no existe (p. ej.
  // "KILO" en un producto que se vende por "PIEZA") no resuelve precio.
  function presentacionesDe(productoId: string): string[] {
    const p = prodById[productoId];
    if (!p) return [];
    const keys = Object.keys(p.presentaciones ?? {});
    const def = p.presentacion_default ?? p.unidad_base;
    return def && keys.includes(def) ? [def, ...keys.filter((k) => k !== def)] : keys;
  }
  function presentacionDefault(productoId: string): string {
    return presentacionesDe(productoId)[0] ?? "";
  }

  const [clienteId, setClienteId] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [overrides, setOverrides] = useState<PrecioOverride[]>([]);
  const [scope, setScope] = useState("cliente"); // "cliente" | <sucursalId>

  const [nuevaSuc, setNuevaSuc] = useState({ nombre: "", lista_precios_id: "", serie_factura_id: "", serie_remision_id: "" });
  const [nuevoOvr, setNuevoOvr] = useState({ producto_id: "", presentacion: "KILO", precio_unitario: "" });

  const sucName = useMemo(() => Object.fromEntries(sucursales.map((s) => [s.id, s.nombre])), [sucursales]);

  async function loadSucursales(cid: string) {
    try {
      const r = await apiFetch<Page<Sucursal>>(`/api/v1/sucursales?cliente_id=${cid}&limit=200`);
      setSucursales(r.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las sucursales");
    }
  }
  async function loadOverrides(cid: string, sc: string) {
    try {
      const q = sc === "cliente" ? `cliente_id=${cid}` : `sucursal_id=${sc}`;
      const r = await apiFetch<Page<PrecioOverride>>(`/api/v1/precios/overrides?${q}&limit=200`);
      setOverrides(r.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los precios especiales");
    }
  }

  useEffect(() => {
    if (!clienteId) { setSucursales([]); setOverrides([]); return; }
    setScope("cliente");
    loadSucursales(clienteId);
    loadOverrides(clienteId, "cliente");
  }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeScope(sc: string) {
    setScope(sc);
    if (clienteId) loadOverrides(clienteId, sc);
  }

  async function addSucursal() {
    if (!nuevaSuc.nombre.trim()) { toast.error("Nombre de sucursal requerido"); return; }
    try {
      await post("/api/v1/sucursales", {
        cliente_id: clienteId, nombre: nuevaSuc.nombre.trim(),
        // El código se autogenera en el backend (SUC-01, SUC-02, …).
        lista_precios_id: nuevaSuc.lista_precios_id || null,
        serie_factura_id: nuevaSuc.serie_factura_id || null,
        serie_remision_id: nuevaSuc.serie_remision_id || null,
      });
      toast.success("Sucursal creada");
      setNuevaSuc({ nombre: "", lista_precios_id: "", serie_factura_id: "", serie_remision_id: "" });
      loadSucursales(clienteId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear");
    }
  }
  async function delSucursal(s: Sucursal) {
    try {
      await del(`/api/v1/sucursales/${s.id}`);
      loadSucursales(clienteId);
      if (scope === s.id) changeScope("cliente");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  async function addOverride() {
    if (!nuevoOvr.producto_id || !nuevoOvr.precio_unitario) { toast.error("Elige producto y precio"); return; }
    const body: Record<string, unknown> = {
      producto_id: nuevoOvr.producto_id,
      presentacion: nuevoOvr.presentacion.trim() || "KILO",
      precio_unitario: nuevoOvr.precio_unitario,
    };
    if (scope === "cliente") body.cliente_id = clienteId;
    else body.sucursal_id = scope;
    try {
      await post("/api/v1/precios/overrides", body);
      toast.success("Precio especial agregado");
      setNuevoOvr({ producto_id: "", presentacion: "KILO", precio_unitario: "" });
      loadOverrides(clienteId, scope);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar");
    }
  }
  async function delOverride(o: PrecioOverride) {
    try {
      await del(`/api/v1/precios/overrides/${o.id}`);
      loadOverrides(clienteId, scope);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  // ── cotizador ──
  const [cot, setCot] = useState({ producto_id: "", presentacion: "KILO", cantidad: "1", sucursal_id: "" });
  const [cotRes, setCotRes] = useState<Cotizacion | null>(null);
  async function cotizar() {
    if (!cot.producto_id) { toast.error("Elige producto"); return; }
    const p = new URLSearchParams({ producto_id: cot.producto_id, presentacion: cot.presentacion || "KILO", cantidad: cot.cantidad || "1" });
    if (cot.sucursal_id) p.set("sucursal_id", cot.sucursal_id);
    else if (clienteId) p.set("cliente_id", clienteId);
    try {
      setCotRes(await apiFetch<Cotizacion>(`/api/v1/precios/cotizar?${p.toString()}`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cotizar");
    }
  }

  const sucCols: Column<Sucursal>[] = [
    { header: "Sucursal", cell: (s) => <span className="font-medium">{s.nombre}</span> },
    { header: "Código", cell: (s) => s.codigo ?? "—" },
    { header: "Lista propia", cell: (s) => (s.lista_precios_id ? listaName[s.lista_precios_id] ?? "—" : "(hereda del cliente)") },
    {
      header: "", className: "text-right w-1",
      cell: (s) => canSuc ? (
        <button onClick={() => delSucursal(s)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Eliminar"><Trash2 size={16} /></button>
      ) : null,
    },
  ];

  const ovrCols: Column<PrecioOverride>[] = [
    { header: "Producto", cell: (o) => prodName[o.producto_id] ?? o.producto_id },
    { header: "Present.", cell: (o) => o.presentacion },
    { header: "Precio", cell: (o) => fmtMoney(o.precio_unitario), className: "text-right" },
    {
      header: "", className: "text-right w-1",
      cell: (o) => canOvr ? (
        <button onClick={() => delOverride(o)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Eliminar"><Trash2 size={16} /></button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Sucursales y precios" subtitle="Sucursales por cliente, precios especiales y cotizador en vivo." />

      <div className="mb-4 max-w-md">
        <Field label="Cliente">
          <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">— Elige un cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </Select>
        </Field>
      </div>

      {!clienteId ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title="Elige un cliente"
          hint="Selecciona un cliente para administrar sus sucursales y precios especiales."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sucursales */}
          <section className="rounded-xl border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">Sucursales (entrega)</h2>
            {canSuc && (
              <div className="mb-3 space-y-2">
                <Field label="Nombre">
                  <Input
                    placeholder="Ej. Matriz Centro"
                    value={nuevaSuc.nombre}
                    onChange={(e) => setNuevaSuc({ ...nuevaSuc, nombre: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Serie de factura">
                    <Select value={nuevaSuc.serie_factura_id} onChange={(e) => setNuevaSuc({ ...nuevaSuc, serie_factura_id: e.target.value })}>
                      <option value="">(usa la del cliente / default)</option>
                      {seriesFac.map((s) => <option key={s.id} value={s.id}>{s.codigo}{s.nombre ? ` · ${s.nombre}` : ""}</option>)}
                    </Select>
                  </Field>
                  <Field label="Serie de remisión">
                    <Select value={nuevaSuc.serie_remision_id} onChange={(e) => setNuevaSuc({ ...nuevaSuc, serie_remision_id: e.target.value })}>
                      <option value="">(usa la del cliente / default)</option>
                      {seriesRem.map((s) => <option key={s.id} value={s.id}>{s.codigo}{s.nombre ? ` · ${s.nombre}` : ""}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Lista propia">
                      <Select value={nuevaSuc.lista_precios_id} onChange={(e) => setNuevaSuc({ ...nuevaSuc, lista_precios_id: e.target.value })}>
                        <option value="">(hereda del cliente)</option>
                        {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Button onClick={addSucursal}><Plus size={16} /> Agregar</Button>
                </div>
                <p className="text-xs text-muted">El código se genera automáticamente (SUC-01, SUC-02, …). La serie de la sucursal gana sobre la del cliente.</p>
              </div>
            )}
            <DataTable columns={sucCols} rows={sucursales} empty="Sin sucursales (las ventas usan el precio del cliente)" />
          </section>

          {/* Precios especiales (overrides) */}
          <section className="rounded-xl border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold">Precios especiales</h2>
            <div className="mb-3 max-w-xs">
              <Select value={scope} onChange={(e) => changeScope(e.target.value)}>
                <option value="cliente">Para todo el cliente</option>
                {sucursales.map((s) => <option key={s.id} value={s.id}>Solo en {s.nombre}</option>)}
              </Select>
            </div>
            {canOvr && (
              <div className="mb-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                <div className="col-span-2"><Field label="Producto">
                  <Select value={nuevoOvr.producto_id} onChange={(e) => setNuevoOvr({ ...nuevoOvr, producto_id: e.target.value, presentacion: presentacionDefault(e.target.value) })}>
                    <option value="">— Elige —</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </Select>
                </Field></div>
                <Field label="Present.">
                  <Select value={nuevoOvr.presentacion} onChange={(e) => setNuevoOvr({ ...nuevoOvr, presentacion: e.target.value })} disabled={!nuevoOvr.producto_id}>
                    {presentacionesDe(nuevoOvr.producto_id).map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                  </Select>
                </Field>
                <Field label="Precio">
                  <div className="flex gap-1">
                    <Input type="number" step="0.0001" value={nuevoOvr.precio_unitario} onChange={(e) => setNuevoOvr({ ...nuevoOvr, precio_unitario: e.target.value })} />
                    <Button onClick={addOverride}><Plus size={16} /></Button>
                  </div>
                </Field>
              </div>
            )}
            <DataTable columns={ovrCols} rows={overrides} empty="Sin precios especiales en este alcance" />
          </section>

          {/* Cotizador */}
          <section className="rounded-xl border border-border p-4 lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Calculator size={15} /> Cotizador (precio resuelto)</h2>
            <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
              <div className="col-span-2"><Field label="Producto">
                <Select value={cot.producto_id} onChange={(e) => setCot({ ...cot, producto_id: e.target.value, presentacion: presentacionDefault(e.target.value) })}>
                  <option value="">— Elige —</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
              </Field></div>
              <Field label="Present.">
                <Select value={cot.presentacion} onChange={(e) => setCot({ ...cot, presentacion: e.target.value })} disabled={!cot.producto_id}>
                  {presentacionesDe(cot.producto_id).map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                </Select>
              </Field>
              <Field label="Cantidad"><Input type="number" value={cot.cantidad} onChange={(e) => setCot({ ...cot, cantidad: e.target.value })} /></Field>
              <Field label="Sucursal">
                <div className="flex gap-1">
                  <Select value={cot.sucursal_id} onChange={(e) => setCot({ ...cot, sucursal_id: e.target.value })}>
                    <option value="">(cliente)</option>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </Select>
                  <Button onClick={cotizar}>Cotizar</Button>
                </div>
              </Field>
            </div>
            {cotRes && (
              <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3 text-sm">
                {cotRes.precio != null ? (
                  <>Precio: <b>{fmtMoney(cotRes.precio)}</b> · origen: <b>{ORIGEN_LABEL[cotRes.origen ?? ""] ?? cotRes.origen ?? "—"}</b></>
                ) : (
                  <span className="text-danger">Sin precio resoluble (configura una lista u override).</span>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
