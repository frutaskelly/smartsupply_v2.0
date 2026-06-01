"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileCode2, Plus, Stamp } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Checkbox, Field, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiDownload, apiFetch } from "@/lib/api";
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

  const clientesRes = useResource<Page<Cliente>>("/api/v1/clientes?limit=500");
  const clientes = clientesRes.data?.items ?? [];
  const cliName = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c.legal_name])), [clientes]);

  const seriesFacRes = useResource<Page<Serie>>("/api/v1/series?tipo_documento=FACTURA&activa=true&limit=200");
  const seriesFac = seriesFacRes.data?.items ?? [];

  const [fEstado, setFEstado] = useState("");
  const [fCliente, setFCliente] = useState("");
  const listPath = useMemo(() => {
    const p = new URLSearchParams({ limit: "50" });
    if (fEstado) p.set("estado", fEstado);
    if (fCliente) p.set("cliente_id", fCliente);
    return `/api/v1/facturas?${p.toString()}`;
  }, [fEstado, fCliente]);
  const { data, loading, error, reload } = useResource<Page<Factura>>(listPath);
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
    apiFetch<Page<Remision>>(`/api/v1/remisiones?estado=CONFIRMADA&cliente_id=${genCliente}&limit=200`)
      .then((r) => setRemisiones(r.items.filter((x) => !x.factura_id)))
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

  // ── acciones por factura ──
  const [detalle, setDetalle] = useState<FacturaDetail | null>(null);
  const [toTimbrar, setToTimbrar] = useState<Factura | null>(null);
  const [toCancel, setToCancel] = useState<Factura | null>(null);
  const [actBusy, setActBusy] = useState(false);

  async function verDetalle(f: Factura) {
    try { setDetalle(await apiFetch<FacturaDetail>(`/api/v1/facturas/${f.id}`)); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "No se pudo cargar"); }
  }
  async function timbrar() {
    if (!toTimbrar) return;
    setActBusy(true);
    try {
      await apiFetch(`/api/v1/facturas/${toTimbrar.id}/timbrar`, { method: "POST" });
      toast.success("Factura timbrada (sandbox)");
      setToTimbrar(null); reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo timbrar");
    } finally { setActBusy(false); }
  }
  async function cancelar() {
    if (!toCancel) return;
    setActBusy(true);
    try {
      await apiFetch(`/api/v1/facturas/${toCancel.id}/cancelar`, {
        method: "POST", body: JSON.stringify({ motivo: "02" }),
      });
      toast.success("Factura cancelada (sandbox)");
      setToCancel(null); reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cancelar");
    } finally { setActBusy(false); }
  }
  async function descargar(f: Factura, tipo: "pdf" | "xml") {
    try { await apiDownload(`/api/v1/facturas/${f.id}/${tipo}`, `${f.serie}${f.folio}.${tipo}`); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "No se pudo descargar"); }
  }

  const columns: Column<Factura>[] = [
    { header: "Folio", cell: (f) => <span className="font-medium">{f.serie}{f.folio}</span> },
    { header: "Cliente", cell: (f) => cliName[f.cliente_id] ?? "—" },
    { header: "Fecha", cell: (f) => fmtDate(f.fecha) },
    { header: "Estado", cell: (f) => <Badge tone={ESTADO_TONE[f.estado] ?? "muted"}>{f.estado}</Badge> },
    { header: "Total", cell: (f) => fmtMoney(f.total), className: "text-right" },
    {
      header: "",
      className: "text-right",
      cell: (f) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => verDetalle(f)} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground">Ver</button>
          {canWrite && f.estado === "BORRADOR" && (
            <button onClick={() => setToTimbrar(f)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-success hover:bg-surface-2"><Stamp size={13} /> Timbrar</button>
          )}
          {f.estado === "TIMBRADA" && (
            <>
              <button onClick={() => descargar(f, "pdf")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2"><Download size={13} /> PDF</button>
              <button onClick={() => descargar(f, "xml")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2"><FileCode2 size={13} /> XML</button>
              {canWrite && <button onClick={() => setToCancel(f)} className="rounded-md px-2 py-1 text-xs text-danger hover:bg-surface-2">Cancelar</button>}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Facturas"
        subtitle="CFDI 4.0 — timbrado en modo sandbox (pruebas)"
        actions={canWrite ? <Button onClick={openGen}><Plus size={16} /> Generar desde remisiones</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="max-w-[10rem]">
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="TIMBRADA">Timbrada</option>
          <option value="CANCELADA">Cancelada</option>
        </Select>
        <Select value={fCliente} onChange={(e) => setFCliente(e.target.value)} className="max-w-xs">
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} error={error} empty="Sin facturas" />

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
          <div className="mb-2 text-sm font-medium">Remisiones confirmadas sin facturar</div>
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

      {/* detalle */}
      <Modal open={detalle !== null} onClose={() => setDetalle(null)} title={detalle ? `Factura ${detalle.serie}${detalle.folio}` : ""} wide
        footer={<Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>}>
        {detalle && (
          <div>
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <div><span className="text-muted">Cliente:</span> {cliName[detalle.cliente_id] ?? "—"}</div>
              <div><span className="text-muted">Estado:</span> <Badge tone={ESTADO_TONE[detalle.estado] ?? "muted"}>{detalle.estado}</Badge></div>
              {detalle.uuid && <div><span className="text-muted">UUID:</span> <span className="font-mono text-xs">{detalle.uuid}</span></div>}
              {detalle.fecha_timbrado && <div><span className="text-muted">Timbrada:</span> {fmtDateTime(detalle.fecha_timbrado)}</div>}
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-1">Descripción</th><th className="text-right">Cant.</th><th className="text-right">P. unit.</th><th className="text-right">IVA</th><th className="text-right">Importe</th>
              </tr></thead>
              <tbody>
                {detalle.lineas.map((l) => (
                  <tr key={l.numero_linea} className="border-b border-border/50">
                    <td className="py-1">{l.descripcion}</td>
                    <td className="text-right tabular-nums">{l.cantidad}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.valor_unitario)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.iva_importe)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(l.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-col items-end gap-1 text-sm">
              <div className="flex gap-4"><span className="text-muted">Subtotal</span><span className="tabular-nums">{fmtMoney(detalle.subtotal)}</span></div>
              <div className="flex gap-4"><span className="text-muted">IVA</span><span className="tabular-nums">{fmtMoney(detalle.iva_trasladado)}</span></div>
              <div className="flex gap-4 text-base font-semibold"><span>Total</span><span className="tabular-nums">{fmtMoney(detalle.total)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={toTimbrar !== null} title="Timbrar factura (sandbox)"
        message={`¿Timbrar ${toTimbrar?.serie}${toTimbrar?.folio}? Se enviará al PAC en modo sandbox (prueba).`}
        onConfirm={timbrar} onClose={() => setToTimbrar(null)} loading={actBusy} />
      <ConfirmDialog open={toCancel !== null} title="Cancelar factura"
        message={`¿Cancelar ${toCancel?.serie}${toCancel?.folio} ante el PAC (sandbox)?`}
        onConfirm={cancelar} onClose={() => setToCancel(null)} loading={actBusy} />
    </div>
  );
}
