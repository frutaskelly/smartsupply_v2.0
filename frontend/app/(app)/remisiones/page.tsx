"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, FileText, Mail, Plus, Printer, Trash2, X } from "lucide-react";

import { KeyboardCombobox, type ComboOption } from "@/components/KeyboardCombobox";
import { ProductoCombobox, type ProductoPick } from "@/components/ProductoCombobox";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column, type RowAction } from "@/components/ui/DataTable";
import { DataTableSmart } from "@/components/ui/DataTableSmart";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import type { Almacen, Cliente, MatchResult, Producto, Remision, RemisionDetail, Serie, Sucursal } from "@/lib/types";

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
  presentacion: "",
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
  const cliEmail = useMemo(
    () => Object.fromEntries(clientes.map((c) => [c.id, (c.domicilio_fiscal?.email as string) ?? ""])),
    [clientes],
  );

  // lista
  const { data, loading, error, reload } = useResource<Page<Remision>>("/api/v1/remisiones?limit=50");
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
  const subtotalPreview = lineas.reduce((s, l) => s + (l.importe || 0), 0);
  const iepsPreview = lineas.reduce((s, l) => s + (l.importe || 0) * Number(prodById[l.producto_id]?.ieps_tasa ?? 0), 0);
  const ivaPreview = lineas.reduce((s, l) => s + (l.importe || 0) * Number(prodById[l.producto_id]?.iva_tasa ?? 0), 0);
  const totalPreview = subtotalPreview + iepsPreview + ivaPreview;

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
      if (alms.length === 0) { setAlmacenId(""); return resolveFrom("lineas", sucs, alms); }
      if (alms.length === 1) { setAlmacenId(alms[0].id); return resolveFrom("lineas", sucs, alms); }
      return setStep("almacen");
    }
    // La serie se resuelve sola (automática o la del cliente) → NO detiene el flujo.
    // Sigue editable manualmente; el Enter pasa directo a las líneas.
    if (!fecha) setFecha(today());
    setStep("lineas");
    setLineFocus({ key: lineas[0]?.key, field: "cantidad" });   // enfoca la primera línea (Cantidad)
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
    // Secuencia: Cantidad → Producto → Presentación → Precio → (siguiente línea).
    if (from === "cantidad") return setLineFocus({ key, field: "producto" });
    if (from === "producto") return setLineFocus({ key, field: "presentacion" });
    if (from === "presentacion") return setLineFocus({ key, field: "precio" });
    // precio → siguiente línea (o crea una nueva si es la última), enfocando Cantidad
    const idx = lineas.findIndex((l) => l.key === key);
    if (idx === lineas.length - 1) {
      const nl = nuevaLinea();
      setLineas((ls) => [...ls, nl]);
      return setLineFocus({ key: nl.key, field: "cantidad" });
    }
    return setLineFocus({ key: lineas[idx + 1].key, field: "cantidad" });
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
    // La presentación viene del propio producto (no de un fetch separado), así el
    // default real (p. ej. PIEZA) se respeta y el precio se cotiza con la presentación correcta.
    const pres = Object.keys(pick.presentaciones ?? {});
    const def = pick.presentacion_default ?? pick.unidad_base ?? pres[0] ?? "PIEZA";
    const presentacion = pres.includes(def) ? def : pres[0] ?? def;
    setLinea(key, {
      producto_id: pick.producto_id,
      label: pick.nombre,        // sin SKU
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
    let matches: MatchResult[] = [];
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
        const presKeys = Object.keys(auto.presentaciones ?? {});
        const def = auto.presentacion_default ?? auto.unidad_base ?? presKeys[0] ?? "PIEZA";
        const presentacion = presIn && presKeys.includes(presIn) ? presIn : presKeys.includes(def) ? def : presKeys[0] ?? def;
        return nuevaLinea({
          texto, producto_id: auto.producto_id, label: auto.nombre,
          presentaciones: presKeys, presentacion, cantidad,
        });
      }
      return nuevaLinea({ texto, cantidad, presentacion: presIn }); // sin resolver → el usuario confirma
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

  async function guardar(confirmar = false) {
    if (saving) return; // evita doble envío (doble clic / doble disparo)
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
      // `post` (useMutation) activa `saving`, que deshabilita el botón mientras
      // se crea — así un segundo clic/disparo no genera una remisión duplicada.
      const rem = await post<RemisionDetail>("/api/v1/remisiones", payload);
      if (confirmar) {
        await post(`/api/v1/remisiones/${rem.id}/confirmar`, {});
        toast.success(`Remisión ${rem.folio_interno} confirmada (inventario reservado)`);
      } else {
        toast.success(`Remisión ${rem.folio_interno} guardada (borrador)`);
      }
      setMode("list");
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear la remisión");
    }
  }

  // ── acciones de lista ──
  // Detalle por fila: se carga bajo demanda al expandir la fila (slide-down).
  const [detalles, setDetalles] = useState<Record<string, RemisionDetail>>({});
  const [detalleLoading, setDetalleLoading] = useState<Set<string>>(new Set());
  const [toConfirm, setToConfirm] = useState<Remision | null>(null);
  const [toCancel, setToCancel] = useState<Remision | null>(null);

  async function verDetalle(r: Remision) {
    if (detalles[r.id] || detalleLoading.has(r.id)) return; // ya cargado / en curso
    setDetalleLoading((s) => new Set(s).add(r.id));
    try {
      const d = await apiFetch<RemisionDetail>(`/api/v1/remisiones/${r.id}`);
      setDetalles((m) => ({ ...m, [r.id]: d }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar");
    } finally {
      setDetalleLoading((s) => { const n = new Set(s); n.delete(r.id); return n; });
    }
  }

  // Contenido del panel que se despliega bajo la fila al hacer clic.
  function renderDetalle(r: Remision) {
    const d = detalles[r.id];
    if (!d) {
      return <div className="flex justify-center py-6"><Spinner /></div>;
    }
    // Remisión no fiscal (encabezado guarda iva/ieps=0); el desglose se calcula
    // desde las tasas del producto, consistente con las columnas por línea.
    const subtotal = d.lineas.reduce((s, l) => s + Number(l.importe), 0);
    const ieps = d.lineas.reduce((s, l) => s + Number(l.importe) * Number(prodById[l.producto_id]?.ieps_tasa ?? 0), 0);
    const iva = d.lineas.reduce((s, l) => s + Number(l.importe) * Number(prodById[l.producto_id]?.iva_tasa ?? 0), 0);
    const total = subtotal + ieps + iva;
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <div><span className="text-muted">Cliente:</span> {cliName[d.cliente_facturacion_id] ?? "—"}</div>
          <div><span className="text-muted">Fecha:</span> {fmtDate(d.fecha_remision)}</div>
          <div><span className="text-muted">Estado:</span> <Badge tone={ESTADO_TONE[d.estado] ?? "muted"}>{d.estado}</Badge></div>
        </div>
        <DataTable
          rows={d.lineas}
          rowKey={(l) => l.id}
          empty="Sin líneas"
          columns={[
            { header: "Cant.", className: "text-right tabular-nums", cell: (l) => fmtNumber(l.cantidad_solicitada) },
            { header: "Pres.", cell: (l) => l.presentacion },
            { header: "Descr.", cell: (l) => l.producto_nombre ?? prodById[l.producto_id]?.nombre ?? l.producto_id },
            { header: "P/U", className: "text-right tabular-nums", cell: (l) => fmtMoney(l.precio_unitario) },
            { header: "IEPS", className: "text-right tabular-nums", cell: (l) => fmtMoney(Number(l.importe) * Number(prodById[l.producto_id]?.ieps_tasa ?? 0)) },
            { header: "IVA", className: "text-right tabular-nums", cell: (l) => fmtMoney(Number(l.importe) * Number(prodById[l.producto_id]?.iva_tasa ?? 0)) },
            { header: "Importe", className: "text-right tabular-nums", cell: (l) => fmtMoney(l.importe) },
          ]}
        />
        <div className="mt-3 flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-4"><span className="text-muted">Subtotal</span><span className="tabular-nums">{fmtMoney(subtotal)}</span></div>
          <div className="flex gap-4"><span className="text-muted">IEPS</span><span className="tabular-nums">{fmtMoney(ieps)}</span></div>
          <div className="flex gap-4"><span className="text-muted">IVA</span><span className="tabular-nums">{fmtMoney(iva)}</span></div>
          <div className="flex gap-4 text-base font-semibold"><span className="text-muted">Total</span><span className="tabular-nums">{fmtMoney(total)}</span></div>
        </div>
      </div>
    );
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

  // Imprime la remisión en una ventana (vista imprimible).
  async function imprimirRemision(r: Remision) {
    let d = detalles[r.id];
    if (!d) {
      try {
        d = await apiFetch<RemisionDetail>(`/api/v1/remisiones/${r.id}`);
        setDetalles((m) => ({ ...m, [r.id]: d! }));
      } catch {
        toast.error("No se pudo cargar la remisión"); return;
      }
    }
    const total = d.lineas.reduce((s, l) => s + Number(l.importe), 0);
    const filas = d.lineas.map((l) =>
      `<tr><td>${l.producto_nombre ?? prodById[l.producto_id]?.nombre ?? l.producto_id}</td>`
      + `<td>${l.presentacion}</td>`
      + `<td style="text-align:right">${fmtNumber(l.cantidad_solicitada)}</td>`
      + `<td style="text-align:right">${fmtMoney(l.precio_unitario)}</td>`
      + `<td style="text-align:right">${fmtMoney(l.importe)}</td></tr>`).join("");
    const win = window.open("", "_blank", "width=820,height=640");
    if (!win) { toast.error("Permite ventanas emergentes para imprimir"); return; }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Remisión ${r.folio_interno}</title>`
      + `<style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}`
      + `table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}`
      + `th{background:#f4f4f5}tfoot td{font-weight:600}</style></head><body>`
      + `<h1>Remisión ${r.folio_interno}</h1>`
      + `<div>Cliente: ${cliName[d.cliente_facturacion_id] ?? "—"} &middot; Fecha: ${fmtDate(d.fecha_remision)} &middot; Estado: ${d.estado}</div>`
      + `<table><thead><tr><th>Producto</th><th>Pres.</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr></thead>`
      + `<tbody>${filas}</tbody>`
      + `<tfoot><tr><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">${fmtMoney(total)}</td></tr></tfoot></table>`
      + `</body></html>`);
    win.document.close(); win.focus(); win.print();
  }

  // ── enviar por correo ──
  const [toSend, setToSend] = useState<Remision | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);

  function enviarRemision(r: Remision) {
    setSendTo(cliEmail[r.cliente_facturacion_id] ?? "");
    setToSend(r);
  }

  async function confirmarEnvio() {
    if (!toSend) return;
    if (!sendTo.trim()) {
      toast.error("Indica un correo destinatario");
      return;
    }
    setSending(true);
    try {
      await apiFetch(`/api/v1/remisiones/${toSend.id}/enviar`, {
        method: "POST",
        body: JSON.stringify({ to: sendTo.trim() }),
      });
      toast.success(`Remisión enviada a ${sendTo.trim()}`);
      setToSend(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo enviar la remisión");
    } finally {
      setSending(false);
    }
  }

  const columns: Column<Remision>[] = [
    { header: "Folio", cell: (r) => <span className="font-medium">{r.folio_interno}</span> },
    { header: "Cliente", cell: (r) => cliName[r.cliente_facturacion_id] ?? "—" },
    { header: "Fecha", cell: (r) => fmtDate(r.fecha_remision) },
    { header: "Estado", cell: (r) => <Badge tone={ESTADO_TONE[r.estado] ?? "muted"}>{r.estado}</Badge> },
    { header: "Subtotal", className: "text-right tabular-nums", cell: (r) => fmtMoney(r.subtotal) },
    { header: "IEPS", className: "text-right tabular-nums", cell: (r) => fmtMoney(r.ieps) },
    { header: "IVA", className: "text-right tabular-nums", cell: (r) => fmtMoney(r.iva) },
    { header: "Total", className: "text-right tabular-nums", cell: (r) => fmtMoney(r.total) },
    { header: "Nota", cell: (r) => r.notas ?? "—" },
  ];

  const rowActions: RowAction<Remision>[] = [
    { id: "confirmar", label: "Confirmar", icon: <Check size={15} />, tone: "success",
      onClick: (r) => setToConfirm(r), hidden: (r) => !(canWrite && r.estado === "BORRADOR") },
    { id: "cancelar", label: "Cancelar", icon: <X size={15} />, tone: "danger",
      onClick: (r) => setToCancel(r), hidden: (r) => !(canWrite && r.estado !== "CANCELADA") },
    { id: "imprimir", label: "Imprimir", icon: <Printer size={15} />, onClick: (r) => { void imprimirRemision(r); } },
    { id: "enviar", label: "Enviar por correo", icon: <Mail size={15} />, onClick: enviarRemision },
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
              onAdvance={() => resolveFrom("lineas")}
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
              <div className="col-span-2">Cantidad</div>
              <div className="col-span-3">Producto</div>
              <div className="col-span-2">Presentación</div>
              <div className="col-span-2">Precio</div>
              <div className="col-span-1 text-right">IEPS</div>
              <div className="col-span-1 text-right">IVA</div>
              <div className="col-span-1 text-right">Importe</div>
            </div>
            {lineas.map((l) => (
              <div key={l.key} className="grid grid-cols-12 items-start gap-2">
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    inputMode="decimal" value={l.cantidad}
                    ref={(el) => { cellRefs.current[`${l.key}:cantidad`] = el; }}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); setLinea(l.key, { cantidad: v, importe: Number(l.precio || 0) * Number(v || 0) }); cotizar(l.key, l.producto_id, l.presentacion, v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); advanceLine(l.key, "cantidad"); } }}
                  />
                </div>
                <div className="col-span-12 sm:col-span-3">
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
                    inputMode="decimal" placeholder="auto" value={l.precio}
                    ref={(el) => { cellRefs.current[`${l.key}:precio`] = el; }}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); setLinea(l.key, { precio: v, precioManual: true, importe: Number(v || 0) * Number(l.cantidad || 0) }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); advanceLine(l.key, "precio"); } }}
                  />
                </div>
                <div className="col-span-2 flex items-center justify-end sm:col-span-1">
                  <span className="text-sm tabular-nums">{fmtMoney((l.importe || 0) * Number(prodById[l.producto_id]?.ieps_tasa ?? 0))}</span>
                </div>
                <div className="col-span-2 flex items-center justify-end sm:col-span-1">
                  <span className="text-sm tabular-nums">{fmtMoney((l.importe || 0) * Number(prodById[l.producto_id]?.iva_tasa ?? 0))}</span>
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

          <div className="mt-4 flex items-start justify-between border-t border-border pt-4">
            <div />
            <div className="flex flex-col items-end gap-4">
              <div className="flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-4"><span className="text-muted">Subtotal</span><span className="tabular-nums">{fmtMoney(subtotalPreview)}</span></div>
                <div className="flex gap-4"><span className="text-muted">IEPS</span><span className="tabular-nums">{fmtMoney(iepsPreview)}</span></div>
                <div className="flex gap-4"><span className="text-muted">IVA</span><span className="tabular-nums">{fmtMoney(ivaPreview)}</span></div>
                <div className="flex gap-4 text-base font-semibold"><span className="text-muted">Total</span><span className="tabular-nums">{fmtMoney(totalPreview)}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setMode("list")} disabled={saving}>Borrar</Button>
                <Button variant="secondary" onClick={() => guardar(false)} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
                <Button onClick={() => guardar(true)} disabled={saving}>{saving ? "Guardando…" : "Confirmar"}</Button>
              </div>
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

      <DataTableSmart
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        empty="Sin remisiones"
        rowKey={(r) => r.id}
        actions={rowActions}
        onRowExpand={verDetalle}
        renderExpanded={renderDetalle}
        storageKey="remisiones"
      />

      <ConfirmDialog open={toConfirm !== null} title="Confirmar remisión"
        message={`¿Confirmar ${toConfirm?.folio_interno}? Se reservará el inventario.`}
        onConfirm={confirmar} onClose={() => setToConfirm(null)} loading={saving} />
      <ConfirmDialog open={toCancel !== null} title="Cancelar remisión"
        message={`¿Cancelar ${toCancel?.folio_interno}? Se liberará el inventario reservado.`}
        onConfirm={cancelar} onClose={() => setToCancel(null)} loading={saving} />

      <Modal
        open={toSend !== null}
        onClose={() => setToSend(null)}
        title={`Enviar remisión ${toSend?.folio_interno ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToSend(null)}>Cancelar</Button>
            <Button onClick={confirmarEnvio} disabled={sending}>
              <Mail size={16} /> {sending ? "Enviando…" : "Enviar"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Se enviará la remisión por correo desde la cuenta configurada en Ajustes › Correo.
        </p>
        <Field label="Correo del destinatario" required>
          <Input
            type="email"
            placeholder="cliente@ejemplo.com"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}
