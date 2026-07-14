"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileCode2, Mail, Plus, Stamp, X } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column, type RowAction } from "@/components/ui/DataTable";
import { DataTableSmart } from "@/components/ui/DataTableSmart";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useOnboarding } from "@/components/OnboardingChecklist";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiDownload, apiFetch, apiOpenInTab } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { useResource, type Page } from "@/lib/hooks";
import type { Cliente, Factura, FacturaDetail, Remision, Serie } from "@/lib/types";

const WRITE = "factura:gestionar";

const ESTADO_TONE: Record<string, "success" | "warning" | "muted" | "danger"> = {
  BORRADOR: "warning",
  TIMBRADA: "success",
  CANCELADA: "danger",
};

export default function FacturasPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { status: onboardingStatus } = useOnboarding();
  const ambiente = onboardingStatus?.ambiente ?? "sandbox";

  const clientesRes = useResource<Page<Cliente>>("/api/v1/clientes?limit=500");
  const clientes = clientesRes.data?.items ?? [];
  const cliName = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.legal_name])), [clientes]);

  const seriesFacRes = useResource<Page<Serie>>("/api/v1/series?tipo_documento=FACTURA&activa=true&limit=200");
  const seriesFac = seriesFacRes.data?.items ?? [];

  const { data, loading, error, reload } = useResource<Page<Factura>>("/api/v1/facturas?limit=50");
  const rows = data?.items ?? [];

  // ── generar desde remisiones ──
  const [genOpen, setGenOpen] = useState(false);
  const [genCliente, setGenCliente] = useState("");
  const [genSerie, setGenSerie] = useState("");
  const [remisiones, setRemisiones] = useState<Remision[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!genCliente) { setRemisiones([]); setSel({}); return; }
    apiFetch<Page<Remision>>(`/api/v1/remisiones?cliente_id=${genCliente}&limit=200`)
      .then((r) => setRemisiones(r.items.filter(
        (x) => (x.estado === "BORRADOR" || x.estado === "CONFIRMADA") &&
          (!x.factura_id || x.factura_estado === "CANCELADA"))))
      .catch(() => setRemisiones([]));
    setSel({});
  }, [genCliente]);

  const selIds = Object.entries(sel).filter(([, v]) => v).map(([k]) => k);
  const selTotal = remisiones.filter((r) => sel[r.id]).reduce((s, r) => s + Number(r.total), 0);

  function openGen() {
    setGenCliente(""); setGenSerie(""); setRemisiones([]); setSel({}); setGenOpen(true);
  }

  async function generar() {
    if (selIds.length === 0) { toast.error("Selecciona al menos una remisión"); return; }
    setBusy(true);
    try {
      const f = await apiFetch<FacturaDetail>("/api/v1/facturas/desde-remisiones", {
        method: "POST",
        body: JSON.stringify({ remision_ids: selIds, serie_id: genSerie || null }),
      });
      toast.success(`Factura ${f.serie}${f.folio} creada (borrador)`);
      setGenOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar la factura");
    } finally {
      setBusy(false);
    }
  }

  // ── detalle por fila (slide-down): se carga al expandir y se cachea ──
  const [detalles, setDetalles] = useState<Record<string, FacturaDetail>>({});
  const [detalleLoading, setDetalleLoading] = useState<Set<string>>(new Set());
  const [toTimbrar, setToTimbrar] = useState<Factura | null>(null);
  const [toCancel, setToCancel] = useState<Factura | null>(null);
  // Motivo de cancelación SAT (01–04). 01 requiere UUID de la factura que
  // sustituye; 03 ("no se llevó a cabo") es el único que libera el inventario
  // reservado por las remisiones (backend _release_remision_stock).
  const [cancelMotivo, setCancelMotivo] = useState("02");
  const [cancelSustitucion, setCancelSustitucion] = useState("");
  const [actBusy, setActBusy] = useState(false);

  // ── enviar por correo ──
  const [toEnviar, setToEnviar] = useState<Factura | null>(null);
  const [enviarTo, setEnviarTo] = useState("");
  const [enviarMensaje, setEnviarMensaje] = useState("");
  const [enviarBusy, setEnviarBusy] = useState(false);

  async function verDetalle(f: Factura) {
    if (detalles[f.id] || detalleLoading.has(f.id)) return;
    setDetalleLoading((s) => new Set(s).add(f.id));
    try {
      const d = await apiFetch<FacturaDetail>(`/api/v1/facturas/${f.id}`);
      setDetalles((m) => ({ ...m, [f.id]: d }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar");
    } finally {
      setDetalleLoading((s) => { const n = new Set(s); n.delete(f.id); return n; });
    }
  }

  // Olvida el detalle cacheado tras una acción que cambia el estado.
  function invalidar(id: string) {
    setDetalles((m) => { const n = { ...m }; delete n[id]; return n; });
  }

  function renderDetalle(f: Factura) {
    const d = detalles[f.id];
    if (!d) return <div className="flex justify-center py-6"><Spinner /></div>;
    const ieps = d.lineas.reduce((s, l) => s + Number(l.ieps_importe || 0), 0);
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <div><span className="text-muted">Cliente:</span> {cliName[d.cliente_id] ?? "—"}</div>
          <div><span className="text-muted">Fecha:</span> {fmtDate(d.fecha)}</div>
          <div><span className="text-muted">Estado:</span> <Badge tone={ESTADO_TONE[d.estado] ?? "muted"}>{d.estado}</Badge></div>
          {d.uuid && <div><span className="text-muted">UUID:</span> <span className="font-mono text-xs">{d.uuid}</span></div>}
          {d.fecha_timbrado && <div><span className="text-muted">Timbrada:</span> {fmtDateTime(d.fecha_timbrado)}</div>}
        </div>
        <DataTable
          rows={d.lineas}
          rowKey={(l) => l.numero_linea}
          empty="Sin conceptos"
          columns={[
            { header: "Cant.", className: "text-right tabular-nums", cell: (l) => l.cantidad },
            { header: "Descripción", cell: (l) => l.descripcion },
            { header: "P/U", className: "text-right tabular-nums", cell: (l) => fmtMoney(l.valor_unitario) },
            { header: "IEPS", className: "text-right tabular-nums", cell: (l) => fmtMoney(l.ieps_importe) },
            { header: "IVA", className: "text-right tabular-nums", cell: (l) => fmtMoney(l.iva_importe) },
            { header: "Importe", className: "text-right tabular-nums", cell: (l) => fmtMoney(l.importe) },
          ]}
        />
        <div className="mt-3 flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-4"><span className="text-muted">Subtotal</span><span className="tabular-nums">{fmtMoney(d.subtotal)}</span></div>
          {ieps > 0 && <div className="flex gap-4"><span className="text-muted">IEPS</span><span className="tabular-nums">{fmtMoney(ieps)}</span></div>}
          <div className="flex gap-4"><span className="text-muted">IVA</span><span className="tabular-nums">{fmtMoney(d.iva_trasladado)}</span></div>
          <div className="flex gap-4 text-base font-semibold"><span className="text-muted">Total</span><span className="tabular-nums">{fmtMoney(d.total)}</span></div>
        </div>
      </div>
    );
  }

  async function timbrar() {
    if (!toTimbrar) return;
    setActBusy(true);
    try {
      await apiFetch(`/api/v1/facturas/${toTimbrar.id}/timbrar`, { method: "POST" });
      toast.success("Factura timbrada (sandbox)");
      invalidar(toTimbrar.id);
      setToTimbrar(null); reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo timbrar");
    } finally { setActBusy(false); }
  }
  function abrirCancelar(f: Factura) {
    setCancelMotivo("02");
    setCancelSustitucion("");
    setToCancel(f);
  }
  async function cancelar() {
    if (!toCancel) return;
    if (cancelMotivo === "01" && !cancelSustitucion.trim()) {
      toast.error("El motivo 01 requiere el UUID de la factura que sustituye");
      return;
    }
    setActBusy(true);
    try {
      const body: { motivo: string; uuid_sustitucion?: string } = { motivo: cancelMotivo };
      if (cancelMotivo === "01") body.uuid_sustitucion = cancelSustitucion.trim();
      await apiFetch(`/api/v1/facturas/${toCancel.id}/cancelar`, {
        method: "POST", body: JSON.stringify(body),
      });
      toast.success("Factura cancelada (sandbox)");
      invalidar(toCancel.id);
      setToCancel(null); reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cancelar");
    } finally { setActBusy(false); }
  }
  async function descargar(f: Factura, tipo: "pdf" | "xml") {
    try { await apiDownload(`/api/v1/facturas/${f.id}/${tipo}`, `${f.serie}${f.folio}.${tipo}`); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "No se pudo descargar"); }
  }
  function previsualizar(f: Factura) {
    // La pestaña se abre síncrona al click (antes del fetch autenticado) para
    // que el navegador no la trate como pop-up bloqueado.
    const win = window.open("", "_blank");
    apiOpenInTab(`/api/v1/facturas/${f.id}/pdf`, win).catch((e) => {
      toast.error(e instanceof ApiError ? e.message : "No se pudo abrir la factura");
    });
  }
  function abrirEnviar(f: Factura) {
    setEnviarTo(""); setEnviarMensaje(""); setToEnviar(f);
  }
  async function enviarCorreo() {
    if (!toEnviar) return;
    const destinatarios = enviarTo.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (destinatarios.length === 0) {
      toast.error("Indica al menos un destinatario");
      return;
    }
    setEnviarBusy(true);
    try {
      await apiFetch(`/api/v1/facturas/${toEnviar.id}/enviar`, {
        method: "POST",
        body: JSON.stringify({ to: destinatarios, mensaje: enviarMensaje || undefined }),
      });
      toast.success(`Factura ${toEnviar.serie}${toEnviar.folio} enviada`);
      setToEnviar(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo enviar la factura");
    } finally {
      setEnviarBusy(false);
    }
  }

  const columns: Column<Factura>[] = [
    { header: "Folio", cell: (f) => <span className="font-medium">{f.serie}{f.folio}</span> },
    { header: "Cliente", cell: (f) => cliName[f.cliente_id] ?? "—" },
    { header: "Fecha", cell: (f) => fmtDate(f.fecha) },
    { header: "Estado", cell: (f) => <Badge tone={ESTADO_TONE[f.estado] ?? "muted"}>{f.estado}</Badge> },
    { header: "Subtotal", className: "text-right tabular-nums", cell: (f) => fmtMoney(f.subtotal) },
    { header: "IVA", className: "text-right tabular-nums", cell: (f) => fmtMoney(f.iva_trasladado) },
    { header: "Total", className: "text-right tabular-nums", cell: (f) => fmtMoney(f.total) },
    { header: "Nota", cell: (f) => f.notas ?? "—" },
  ];

  const rowActions: RowAction<Factura>[] = [
    { id: "timbrar", label: "Timbrar", icon: <Stamp size={15} />, tone: "success",
      onClick: (f) => setToTimbrar(f), hidden: (f) => !(canWrite && f.estado === "BORRADOR") },
    { id: "preview", label: "Ver factura", icon: <Eye size={15} />,
      onClick: (f) => previsualizar(f), hidden: (f) => f.estado !== "TIMBRADA" },
    { id: "pdf", label: "Descargar PDF", icon: <Download size={15} />,
      onClick: (f) => { void descargar(f, "pdf"); }, hidden: (f) => f.estado !== "TIMBRADA" },
    { id: "xml", label: "Descargar XML", icon: <FileCode2 size={15} />,
      onClick: (f) => { void descargar(f, "xml"); }, hidden: (f) => f.estado !== "TIMBRADA" },
    { id: "enviar", label: "Enviar por correo", icon: <Mail size={15} />,
      onClick: (f) => abrirEnviar(f), hidden: (f) => !(canWrite && f.estado === "TIMBRADA") },
    { id: "cancelar", label: "Cancelar", icon: <X size={15} />, tone: "danger",
      onClick: (f) => abrirCancelar(f), hidden: (f) => !(canWrite && f.estado === "TIMBRADA") },
  ];

  return (
    <div>
      <PageHeader
        title="Facturas"
        subtitle={ambiente === "producción" ? "CFDI 4.0 — timbrado en producción" : "CFDI 4.0 — timbrado en modo sandbox (pruebas)"}
        actions={canWrite ? <Button onClick={openGen}><Plus size={16} /> Generar desde remisiones</Button> : undefined}
      />

      <DataTableSmart
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        empty="Sin facturas"
        rowKey={(f) => f.id}
        actions={rowActions}
        onRowExpand={verDetalle}
        renderExpanded={renderDetalle}
        storageKey="facturas"
      />

      {/* generar */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generar factura desde remisiones" wide
        footer={<><Button variant="secondary" onClick={() => setGenOpen(false)}>Cancelar</Button>
          <Button onClick={generar} disabled={busy || selIds.length === 0}>{busy ? "Generando…" : `Generar (${selIds.length})`}</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente" required>
            <Select value={genCliente} onChange={(e) => setGenCliente(e.target.value)}>
              <option value="">— Selecciona —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </Select>
          </Field>
          <Field label="Serie" hint="En blanco usa la del cliente / predeterminada">
            <Select value={genSerie} onChange={(e) => setGenSerie(e.target.value)}>
              <option value="">(automática)</option>
              {seriesFac.map((s) => <option key={s.id} value={s.id}>{s.codigo}{s.nombre ? ` · ${s.nombre}` : ""}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">Remisiones sin facturar (borrador o confirmadas)</div>
          {genCliente && remisiones.length === 0 && <div className="text-sm text-muted">Este cliente no tiene remisiones confirmadas pendientes.</div>}
          <div className="max-h-64 space-y-1 overflow-auto">
            {remisiones.map((r) => (
              <label key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Checkbox checked={!!sel[r.id]} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} />
                  <span className="font-medium">{r.folio_interno}</span>
                  <span className="text-muted">{fmtDate(r.fecha_remision)}</span>
                </span>
                <span className="tabular-nums">{fmtMoney(r.total)}</span>
              </label>
            ))}
          </div>
          {selIds.length > 0 && (
            <div className="mt-2 flex justify-end gap-3 text-sm">
              <span className="text-muted">Total seleccionado</span><span className="font-semibold tabular-nums">{fmtMoney(selTotal)}</span>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={toTimbrar !== null} title={ambiente === "producción" ? "Timbrar factura" : "Timbrar factura (sandbox)"}
        message={
          ambiente === "producción"
            ? `¿Timbrar ${toTimbrar?.serie}${toTimbrar?.folio}? Se enviará al PAC en producción — el CFDI será real ante el SAT.`
            : `¿Timbrar ${toTimbrar?.serie}${toTimbrar?.folio}? Se enviará al PAC en modo sandbox (prueba).`
        }
        confirmLabel="Facturar" confirmVariant="success"
        onConfirm={timbrar} onClose={() => setToTimbrar(null)} loading={actBusy} />
      <Modal
        open={toCancel !== null}
        onClose={() => setToCancel(null)}
        title={`Cancelar factura ${toCancel?.serie ?? ""}${toCancel?.folio ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToCancel(null)} disabled={actBusy}>Cerrar</Button>
            <Button variant="danger" onClick={() => { void cancelar(); }} disabled={actBusy}>
              {actBusy ? "Cancelando…" : "Cancelar factura"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Motivo de cancelación (SAT)">
            <Select value={cancelMotivo} onChange={(e) => setCancelMotivo(e.target.value)}>
              <option value="01">01 — Comprobante emitido con errores con relación</option>
              <option value="02">02 — Comprobante emitido con errores sin relación</option>
              <option value="03">03 — No se llevó a cabo la operación</option>
              <option value="04">04 — Operación nominativa en factura global</option>
            </Select>
          </Field>
          {cancelMotivo === "01" && (
            <Field label="UUID de la factura que sustituye" required>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={cancelSustitucion}
                onChange={(e) => setCancelSustitucion(e.target.value)}
              />
            </Field>
          )}
          {cancelMotivo === "03" && (
            <Alert tone="warning">
              El motivo 03 libera el inventario reservado por las remisiones de esta factura
              (vuelven a estar disponibles para refacturar).
            </Alert>
          )}
        </div>
      </Modal>

      <Modal
        open={toEnviar !== null}
        onClose={() => setToEnviar(null)}
        title={`Enviar factura ${toEnviar?.serie ?? ""}${toEnviar?.folio ?? ""} por correo`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToEnviar(null)} disabled={enviarBusy}>Cerrar</Button>
            <Button onClick={() => { void enviarCorreo(); }} disabled={enviarBusy}>
              {enviarBusy ? "Enviando…" : "Enviar"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Destinatario(s)" required hint="Separa varios correos con coma o espacio">
            <Input
              placeholder="cliente@empresa.com"
              value={enviarTo}
              onChange={(e) => setEnviarTo(e.target.value)}
            />
          </Field>
          <Field label="Mensaje (opcional)">
            <Textarea
              rows={3}
              placeholder="Se incluirá arriba del cuerpo del correo"
              value={enviarMensaje}
              onChange={(e) => setEnviarMensaje(e.target.value)}
            />
          </Field>
          <p className="text-xs text-muted">
            Se adjuntan el XML y el PDF de la factura, usando la cuenta de correo configurada en{" "}
            <Link href="/ajustes/correo" className="underline">Ajustes › Correo</Link>.
          </p>
        </div>
      </Modal>
    </div>
  );
}
