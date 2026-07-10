"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, FileText, Mail, Plus, Printer, Trash2, X } from "lucide-react";

import { KeyboardCombobox, type ComboOption } from "@/components/KeyboardCombobox";
import { ProductoCombobox, type ProductoPick } from "@/components/ProductoCombobox";
import { Alert } from "@/components/ui/Alert";
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

// Referencia estable para cuando `data` aún no llega: `?? []` crearía un
// arreglo nuevo en cada render, lo que invalida el memo de `filteredRows` y
// dispara un loop infinito de render en la tabla con selección (ver DataTable
// selectedRows/onSelectionChange).
const EMPTY_REMISIONES: Remision[] = [];

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
  const rows = data?.items ?? EMPTY_REMISIONES;

  // ── filtros de lista (cliente-side) ──
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fCliente, setFCliente] = useState("");
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        const fch = (r.fecha_remision ?? "").slice(0, 10);
        if (fDesde && fch < fDesde) return false;
        if (fHasta && fch > fHasta) return false;
        if (fCliente && r.cliente_facturacion_id !== fCliente) return false;
        return true;
      }),
    [rows, fDesde, fHasta, fCliente],
  );

  // ── selección de filas (acciones en lote) ──
  const [selected, setSelected] = useState<Remision[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const clearSelection = () => { setSelected([]); setSelectionResetKey((k) => k + 1); };

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

  // Interpreta una fila pegada SIN asumir un orden fijo de columnas: la(s)
  // celda(s) no numérica(s) son el producto (y, de haber una segunda, la
  // presentación); de las celdas numéricas, la primera es cantidad y la
  // segunda precio — sin importar en qué posición de la fila vengan ni
  // espacios extra alrededor de cada valor.
  function parseFilaPegada(cols: string[]) {
    const celdas = cols.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
    const numericas: string[] = [];
    const textos: string[] = [];
    for (const c of celdas) {
      const n = Number(c.replace(",", "."));
      if (/^-?[\d.,]+$/.test(c) && !Number.isNaN(n)) numericas.push(String(n));
      else textos.push(c);
    }
    return {
      texto: textos[0] ?? "",
      presentacion: textos[1] ?? "",
      cantidad: numericas[0] && Number(numericas[0]) ? numericas[0] : "1",
      precio: numericas[1] && Number(numericas[1]) ? numericas[1] : "",
    };
  }

  async function procesarPaste() {
    const filas = pasteText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.split("\t"));
    if (filas.length === 0) return;
    const parsed = filas.map(parseFilaPegada);
    const textos = parsed.map((p) => p.texto);
    let matches: MatchResult[] = [];
    try {
      matches = await apiFetch("/api/v1/productos/match", {
        method: "POST",
        body: JSON.stringify({ textos, usar_ia: false, limit: 1 }),
      });
    } catch {
      matches = [];
    }
    const nuevas: LineaForm[] = parsed.map(({ texto, cantidad, precio, presentacion: presIn }, i) => {
      const precioOver: Partial<LineaForm> = precio ? { precio, precioManual: true } : {};
      const top = matches[i]?.candidatos?.[0];
      const auto = top && (top.origen === "exacto" || top.origen === "alias" || top.score >= 85) ? top : null;
      if (auto) {
        const presKeys = Object.keys(auto.presentaciones ?? {});
        const def = auto.presentacion_default ?? auto.unidad_base ?? presKeys[0] ?? "PIEZA";
        const presentacion = presIn && presKeys.includes(presIn) ? presIn : presKeys.includes(def) ? def : presKeys[0] ?? def;
        return nuevaLinea({
          texto, producto_id: auto.producto_id, label: auto.nombre,
          presentaciones: presKeys, presentacion, cantidad, ...precioOver,
        });
      }
      return nuevaLinea({ texto, cantidad, presentacion: presIn, ...precioOver }); // sin resolver → el usuario confirma
    });
    setLineas((ls) => {
      const base = ls.filter((l) => l.producto_id || l.texto);
      return [...base, ...nuevas];
    });
    // cotizar las que sí resolvieron (respeta precioManual si venía precio pegado)
    nuevas.forEach((l) => l.producto_id && cotizar(l.key, l.producto_id, l.presentacion, l.cantidad));
    setPasteText("");
    setPasteOpen(false);
    toast.success(`${nuevas.length} líneas agregadas`);
  }

  // ── pegar una columna directo en la celda (como Excel): pega varias líneas
  // sobre Cantidad o Producto y se reparten hacia abajo desde la fila actual,
  // creando filas nuevas si el pegado trae más líneas de las que ya existen.
  function pegarColumnaCantidad(key: string, text: string) {
    const valores = text.split("\n").map((v) => v.split("\t")[0].trim()).filter(Boolean);
    if (valores.length === 0) return;
    const idx = lineas.findIndex((l) => l.key === key);
    if (idx < 0) return;
    setLineas((ls) => {
      const next = [...ls];
      valores.forEach((v, i) => {
        const cantidad = v.replace(",", ".");
        const pos = idx + i;
        if (pos < next.length) {
          const l = next[pos];
          next[pos] = { ...l, cantidad, importe: Number(l.precio || 0) * Number(cantidad || 0) };
        } else {
          next.push(nuevaLinea({ cantidad }));
        }
      });
      return next;
    });
    valores.forEach((v, i) => {
      const l = lineas[idx + i];
      if (l?.producto_id) cotizar(l.key, l.producto_id, l.presentacion, v.replace(",", "."));
    });
    toast.success(`${valores.length} cantidades pegadas`);
  }

  async function pegarColumnaProducto(key: string, text: string) {
    const valores = text.split("\n").map((v) => v.split("\t")[0].trim()).filter(Boolean);
    if (valores.length === 0) return;
    const idx = lineas.findIndex((l) => l.key === key);
    if (idx < 0) return;
    let matches: MatchResult[] = [];
    try {
      matches = await apiFetch("/api/v1/productos/match", {
        method: "POST",
        body: JSON.stringify({ textos: valores, usar_ia: false, limit: 1 }),
      });
    } catch {
      matches = [];
    }
    const paraCotizar: LineaForm[] = [];
    setLineas((ls) => {
      const next = [...ls];
      valores.forEach((texto, i) => {
        const pos = idx + i;
        const base = pos < next.length ? next[pos] : nuevaLinea();
        const top = matches[i]?.candidatos?.[0];
        const auto = top && (top.origen === "exacto" || top.origen === "alias" || top.score >= 85) ? top : null;
        let linea: LineaForm;
        if (auto) {
          const presKeys = Object.keys(auto.presentaciones ?? {});
          const def = auto.presentacion_default ?? auto.unidad_base ?? presKeys[0] ?? "PIEZA";
          const presentacion = presKeys.includes(def) ? def : presKeys[0] ?? def;
          linea = { ...base, texto, producto_id: auto.producto_id, label: auto.nombre, presentaciones: presKeys, presentacion };
          paraCotizar.push(linea);
        } else {
          linea = { ...base, texto, producto_id: "", label: "" };
        }
        if (pos < next.length) next[pos] = linea;
        else next.push(linea);
      });
      return next;
    });
    paraCotizar.forEach((l) => cotizar(l.key, l.producto_id, l.presentacion, l.cantidad));
    toast.success(`${valores.length} productos pegados`);
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
        try {
          await post(`/api/v1/remisiones/${rem.id}/confirmar`, {});
          toast.success(`Remisión ${rem.folio_interno} confirmada (inventario reservado)`);
        } catch (e) {
          // Sin existencia: la remisión ya quedó como borrador; ofrecemos sobregiro.
          if (e instanceof ApiError && /existencia insuficiente/i.test(e.message)) {
            setNegStock({ remId: rem.id, folio: rem.folio_interno });
            return;
          }
          throw e;
        }
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
  // Sobregiro: cuando confirmar falla por existencia insuficiente, ofrecemos
  // confirmar de todas formas dejando el inventario en negativo.
  const [negStock, setNegStock] = useState<{ remId: string; folio: string } | null>(null);

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
      if (e instanceof ApiError && /existencia insuficiente/i.test(e.message)) {
        setNegStock({ remId: toConfirm.id, folio: toConfirm.folio_interno });
        setToConfirm(null);
        return;
      }
      toast.error(e instanceof ApiError ? e.message : "No se pudo confirmar");
    }
  }
  // Reintenta la confirmación autorizando el sobregiro (inventario negativo).
  async function confirmarNegativo() {
    if (!negStock) return;
    try {
      await post(`/api/v1/remisiones/${negStock.remId}/confirmar`, { permitir_negativos: true });
      toast.success(`Remisión ${negStock.folio} confirmada (inventario en negativo)`);
      setNegStock(null);
      setMode("list");
      reload();
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

  // Carga el detalle de una remisión (usa caché `detalles` si está disponible).
  async function getDetalle(r: Remision): Promise<RemisionDetail | null> {
    if (detalles[r.id]) return detalles[r.id];
    try {
      const d = await apiFetch<RemisionDetail>(`/api/v1/remisiones/${r.id}`);
      setDetalles((m) => ({ ...m, [r.id]: d }));
      return d;
    } catch {
      return null;
    }
  }

  // Construye el HTML imprimible de UNA remisión (una sección por remisión).
  function buildRemisionSection(d: RemisionDetail): string {
    const total = d.lineas.reduce((s, l) => s + Number(l.importe), 0);
    const filas = d.lineas.map((l) =>
      `<tr><td>${l.producto_nombre ?? prodById[l.producto_id]?.nombre ?? l.producto_id}</td>`
      + `<td>${l.presentacion}</td>`
      + `<td style="text-align:right">${fmtNumber(l.cantidad_solicitada)}</td>`
      + `<td style="text-align:right">${fmtMoney(l.precio_unitario)}</td>`
      + `<td style="text-align:right">${fmtMoney(l.importe)}</td></tr>`).join("");
    return (
      `<h1>Remisión ${d.folio_interno}</h1>`
      + `<div>Cliente: ${cliName[d.cliente_facturacion_id] ?? "—"} &middot; Fecha: ${fmtDate(d.fecha_remision)} &middot; Estado: ${d.estado}</div>`
      + `<table><thead><tr><th>Producto</th><th>Pres.</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr></thead>`
      + `<tbody>${filas}</tbody>`
      + `<tfoot><tr><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">${fmtMoney(total)}</td></tr></tfoot></table>`
    );
  }

  // Abre UNA ventana de impresión con una sección por remisión (salto de página
  // entre cada una) y dispara la impresión.
  async function printRemisiones(list: Remision[]) {
    if (list.length === 0) return;
    const dets = (await Promise.all(list.map((r) => getDetalle(r)))).filter(
      (d): d is RemisionDetail => d != null,
    );
    if (dets.length === 0) { toast.error("No se pudo cargar la(s) remisión(es)"); return; }
    const win = window.open("", "_blank", "width=820,height=640");
    if (!win) { toast.error("Permite ventanas emergentes para imprimir"); return; }
    const secciones = dets
      .map((d, i) => {
        const section = buildRemisionSection(d);
        return i < dets.length - 1 ? `<div style="page-break-after:always">${section}</div>` : `<div>${section}</div>`;
      })
      .join("");
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Remisiones</title>`
      + `<style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}`
      + `table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}`
      + `th{background:#f4f4f5}tfoot td{font-weight:600}</style></head><body>`
      + secciones
      + `</body></html>`);
    win.document.close(); win.focus(); win.print();
  }

  // Imprime una sola remisión (vista imprimible).
  async function imprimirRemision(r: Remision) {
    await printRemisiones([r]);
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

  // ── acciones en lote sobre las remisiones seleccionadas ──
  const [bulkBusy, setBulkBusy] = useState(false);
  const [facturarOpen, setFacturarOpen] = useState(false);
  const [confirmarBulkOpen, setConfirmarBulkOpen] = useState(false);
  // Cancelación masiva con doble verificación: paso 1 → paso 2 → ejecuta.
  const [cancelBulkStep, setCancelBulkStep] = useState<0 | 1 | 2>(0);

  // Imprimir todas las seleccionadas en una sola ventana.
  async function bulkImprimir() {
    await printRemisiones(selected);
  }

  // Confirmar en lote las remisiones en BORRADOR seleccionadas (reserva stock).
  async function bulkConfirmar() {
    const elegibles = selected.filter((r) => r.estado === "BORRADOR");
    if (elegibles.length === 0) {
      toast.error("No hay remisiones en borrador en la selección");
      setConfirmarBulkOpen(false);
      return;
    }
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        elegibles.map((r) => post(`/api/v1/remisiones/${r.id}/confirmar`, {})),
      );
      const ok = results.filter((x) => x.status === "fulfilled").length;
      const fail = results.length - ok;
      const partes = [`Confirmadas: ${ok}`];
      if (fail) partes.push(`${fail} con error (p. ej. sin existencia)`);
      toast[fail === 0 ? "success" : "error"](partes.join(" · "));
      setConfirmarBulkOpen(false);
      clearSelection();
      reload();
    } finally {
      setBulkBusy(false);
    }
  }

  // Cancelar en lote (libera inventario de las confirmadas). Doble verificación.
  async function bulkCancelar() {
    const elegibles = selected.filter((r) => r.estado !== "CANCELADA");
    if (elegibles.length === 0) {
      toast.error("No hay remisiones cancelables en la selección");
      setCancelBulkStep(0);
      return;
    }
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        elegibles.map((r) => post(`/api/v1/remisiones/${r.id}/cancelar`, {})),
      );
      const ok = results.filter((x) => x.status === "fulfilled").length;
      const fail = results.length - ok;
      const partes = [`Canceladas: ${ok}`];
      if (fail) partes.push(`${fail} con error`);
      toast[fail === 0 ? "success" : "error"](partes.join(" · "));
      setCancelBulkStep(0);
      clearSelection();
      reload();
    } finally {
      setBulkBusy(false);
    }
  }

  // Enviar por correo cada seleccionada (destinatario por defecto en backend).
  async function bulkEnviar() {
    if (selected.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        selected.map((r) => apiFetch(`/api/v1/remisiones/${r.id}/enviar`, { method: "POST", body: JSON.stringify({}) })),
      );
      const ok = results.filter((x) => x.status === "fulfilled").length;
      const fail = results.length - ok;
      toast[fail === 0 ? "success" : "error"](`Enviadas ${ok} de ${selected.length}${fail ? ` (${fail} fallidas)` : ""}`);
    } finally {
      setBulkBusy(false);
    }
  }

  // Facturar las seleccionadas. `modo`:
  //  - "sumar":     una factura por cliente, sumando líneas del mismo producto en un concepto
  //  - "sin_sumar": una factura por cliente, una línea por cada partida de remisión
  //  - "separado":  una factura por remisión
  // Solo elegibles: CONFIRMADA y sin factura_id. El resto se omite.
  async function bulkFacturar(modo: "sumar" | "sin_sumar" | "separado") {
    const elegibles = selected.filter((r) => r.estado === "CONFIRMADA" && !r.factura_id);
    const omitidas = selected.length - elegibles.length;
    if (elegibles.length === 0) {
      toast.error(`Ninguna remisión elegible (se omitieron ${omitidas} no confirmadas o ya facturadas)`);
      setFacturarOpen(false);
      return;
    }
    // grupos de ids según el modo
    let grupos: string[][];
    if (modo === "separado") {
      grupos = elegibles.map((r) => [r.id]);
    } else {
      const byCliente = new Map<string, string[]>();
      for (const r of elegibles) {
        const arr = byCliente.get(r.cliente_facturacion_id) ?? [];
        arr.push(r.id);
        byCliente.set(r.cliente_facturacion_id, arr);
      }
      grupos = [...byCliente.values()];
    }
    const agrupar_productos = modo === "sumar";
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        grupos.map((remision_ids) =>
          post("/api/v1/facturas/desde-remisiones", { remision_ids, agrupar_productos }),
        ),
      );
      const creadas = results.filter((x) => x.status === "fulfilled").length;
      const fallidas = results.length - creadas;
      const partes = [`Facturas creadas: ${creadas}`];
      if (fallidas) partes.push(`${fallidas} fallidas`);
      if (omitidas) partes.push(`${omitidas} omitidas`);
      toast[fallidas === 0 ? "success" : "error"](partes.join(" · "));
      setFacturarOpen(false);
      clearSelection();
      reload();
    } finally {
      setBulkBusy(false);
    }
  }

  const columns: Column<Remision>[] = [
    { header: "Folio", sortable: true, sortValue: (r) => r.folio_interno, cell: (r) => <span className="font-medium">{r.folio_interno}</span> },
    { header: "Cliente", sortable: true, sortValue: (r) => cliName[r.cliente_facturacion_id] ?? "", cell: (r) => cliName[r.cliente_facturacion_id] ?? "—" },
    { header: "Fecha", sortable: true, sortValue: (r) => r.fecha_remision, cell: (r) => fmtDate(r.fecha_remision) },
    { header: "Estado", sortable: true, sortValue: (r) => r.estado, cell: (r) => <Badge tone={ESTADO_TONE[r.estado] ?? "muted"}>{r.estado}</Badge> },
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
    { id: "enviar", label: "Enviar por correo", icon: <Mail size={15} />, onClick: enviarRemision,
      hidden: () => !canWrite },
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
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (text.includes("\n")) { e.preventDefault(); pegarColumnaCantidad(l.key, text); }
                    }}
                  />
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <ProductoCombobox
                    label={l.label || l.texto}
                    onSelect={(p, t) => onPickProducto(l.key, p, t)}
                    autoFocus={lineFocus?.key === l.key && lineFocus?.field === "producto"}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (text.includes("\n")) { e.preventDefault(); void pegarColumnaProducto(l.key, text); }
                    }}
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
          <p className="mb-2 text-sm text-muted">Pega columnas separadas por tabulador (una fila por línea): <strong>producto</strong> y, en cualquier orden, <strong>cantidad</strong>, <strong>precio</strong> y/o <strong>presentación</strong> — el sistema detecta cuál es cuál. El producto se cruza automáticamente.</p>
          <Textarea rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"zanahoria\t10\tKILO\njitomate\t5\t12.50"} />
        </Modal>
      </div>
    );
  }

  // Remisiones elegibles a facturar dentro de la selección y sus clientes distintos.
  // Una sola factura solo es válida con un único cliente: si hay varios, esas
  // opciones se deshabilitan en el popup (solo queda "Separado").
  const facturarElegibles = selected.filter((r) => r.estado === "CONFIRMADA" && !r.factura_id);
  const clientesElegibles = [...new Set(facturarElegibles.map((r) => r.cliente_facturacion_id))];
  const multiCliente = clientesElegibles.length > 1;
  // Borradores (confirmables) y no-canceladas (cancelables) dentro de la selección.
  const borradoresSel = selected.filter((r) => r.estado === "BORRADOR");
  const cancelablesSel = selected.filter((r) => r.estado !== "CANCELADA");

  return (
    <div>
      <PageHeader
        title="Remisiones"
        subtitle="Notas de entrega (no fiscales)"
        actions={canWrite ? <Button onClick={openCreate}><Plus size={16} /> Nueva remisión</Button> : undefined}
      />

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
        </Field>
        <Field label="Cliente">
          <Select value={fCliente} onChange={(e) => setFCliente(e.target.value)} aria-label="Filtrar por cliente">
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.legal_name}</option>
            ))}
          </Select>
        </Field>
        {(fDesde || fHasta || fCliente) && (
          <Button variant="secondary" onClick={() => { setFDesde(""); setFHasta(""); setFCliente(""); }}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Barra de acciones en lote */}
      {selected.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium">{selected.length} seleccionada(s)</span>
          <span className="text-sm text-muted">·</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { void bulkImprimir(); }} disabled={bulkBusy}>
              <Printer size={16} /> Imprimir ({selected.length})
            </Button>
            {canWrite && (
              <Button variant="secondary" onClick={() => { void bulkEnviar(); }} disabled={bulkBusy}>
                <Mail size={16} /> Enviar por correo ({selected.length})
              </Button>
            )}
            {canWrite && borradoresSel.length > 0 && (
              <Button variant="success" onClick={() => setConfirmarBulkOpen(true)} disabled={bulkBusy}>
                <Check size={16} /> Confirmar ({borradoresSel.length})
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setFacturarOpen(true)} disabled={bulkBusy}>
                <FileText size={16} /> Facturar ({selected.length})
              </Button>
            )}
            {canWrite && cancelablesSel.length > 0 && (
              <Button variant="danger" onClick={() => setCancelBulkStep(1)} disabled={bulkBusy}>
                <X size={16} /> Cancelar ({cancelablesSel.length})
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-sm text-muted hover:text-foreground"
          >
            Limpiar selección
          </button>
        </div>
      )}

      <DataTableSmart
        columns={columns}
        rows={filteredRows}
        loading={loading}
        error={error}
        empty="Sin remisiones"
        rowKey={(r) => r.id}
        actions={rowActions}
        onRowExpand={verDetalle}
        renderExpanded={renderDetalle}
        storageKey="remisiones"
        selectable
        onSelectionChange={setSelected}
        selectionResetKey={selectionResetKey}
      />

      <ConfirmDialog open={toConfirm !== null} title="Confirmar remisión"
        message={`¿Confirmar ${toConfirm?.folio_interno}? Se reservará el inventario.`}
        confirmLabel="Confirmar" confirmVariant="success"
        onConfirm={confirmar} onClose={() => setToConfirm(null)} loading={saving} />
      <ConfirmDialog open={toCancel !== null} title="Cancelar remisión"
        message={`¿Cancelar ${toCancel?.folio_interno}? Se liberará el inventario reservado.`}
        onConfirm={cancelar} onClose={() => setToCancel(null)} loading={saving} />
      <ConfirmDialog open={negStock !== null} title="Existencia insuficiente"
        message={`No hay existencia suficiente para confirmar ${negStock?.folio}. ¿Deseas remisionar de todas formas? El inventario quedará en negativo (sobregiro).`}
        confirmLabel="Remisionar sin existencias" confirmVariant="primary"
        onConfirm={confirmarNegativo} onClose={() => setNegStock(null)} loading={saving} />

      {/* Confirmar en lote (borradores → reserva inventario) */}
      <ConfirmDialog open={confirmarBulkOpen} title="Confirmar remisiones"
        message={`¿Confirmar ${borradoresSel.length} remisión(es) en borrador? Se reservará el inventario de cada una. Las que no tengan existencia suficiente se reportarán como error.`}
        confirmLabel="Confirmar" confirmVariant="success"
        onConfirm={() => { void bulkConfirmar(); }} onClose={() => setConfirmarBulkOpen(false)} loading={bulkBusy} />

      {/* Cancelar en lote — doble verificación */}
      <ConfirmDialog open={cancelBulkStep === 1} title="Cancelar remisiones"
        message={`Vas a cancelar ${cancelablesSel.length} remisión(es). Se liberará el inventario reservado de las confirmadas. ¿Continuar?`}
        confirmLabel="Continuar" confirmVariant="danger"
        onConfirm={() => setCancelBulkStep(2)} onClose={() => setCancelBulkStep(0)} loading={bulkBusy} />
      <ConfirmDialog open={cancelBulkStep === 2} title="Confirmación final"
        message={`Esta acción no se puede deshacer. Se cancelarán ${cancelablesSel.length} remisión(es) de forma definitiva. ¿Confirmas la cancelación?`}
        confirmLabel="Sí, cancelar definitivamente" confirmVariant="danger"
        onConfirm={() => { void bulkCancelar(); }} onClose={() => setCancelBulkStep(0)} loading={bulkBusy} />

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

      <Modal
        open={facturarOpen}
        onClose={() => setFacturarOpen(false)}
        title={`Facturar ${selected.length} remisión(es)`}
        footer={
          <Button variant="secondary" onClick={() => setFacturarOpen(false)} disabled={bulkBusy}>Cerrar</Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Solo se facturan las remisiones <strong>confirmadas</strong> y sin factura previa; el resto se omite.
          Elige cómo generar la(s) factura(s):
        </p>
        {multiCliente && (
          <div className="mb-3">
            <Alert tone="warning">
              Seleccionaste remisiones de <strong>{clientesElegibles.length} clientes distintos</strong>.
              No se puede emitir una sola factura con varios clientes; usa <strong>Separado</strong>
              {" "}(una factura por remisión).
            </Alert>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={bulkBusy || multiCliente}
            title={multiCliente ? "No disponible: la selección tiene varios clientes" : undefined}
            onClick={() => { void bulkFacturar("sumar"); }}
            className="rounded-lg border border-border p-3 text-left transition hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent"
          >
            <div className="font-medium">Sumatoria de productos en una factura</div>
            <div className="text-sm text-muted">
              Una factura. Las líneas del mismo producto se suman en un solo concepto.
            </div>
          </button>
          <button
            type="button"
            disabled={bulkBusy || multiCliente}
            title={multiCliente ? "No disponible: la selección tiene varios clientes" : undefined}
            onClick={() => { void bulkFacturar("sin_sumar"); }}
            className="rounded-lg border border-border p-3 text-left transition hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent"
          >
            <div className="font-medium">Productos sin sumatoria en una factura</div>
            <div className="text-sm text-muted">
              Una factura. Cada partida de cada remisión queda como una línea independiente.
            </div>
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => { void bulkFacturar("separado"); }}
            className="rounded-lg border border-border p-3 text-left transition hover:border-accent hover:bg-accent/5 disabled:opacity-50"
          >
            <div className="font-medium">Separado</div>
            <div className="text-sm text-muted">Una factura por cada remisión.</div>
          </button>
        </div>
      </Modal>
    </div>
  );
}
