"use client";

import { useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Switch } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import type { Serie } from "@/lib/types";

const WRITE = "serie:gestionar";

const DOC_LABEL: Record<string, string> = {
  FACTURA: "Factura",
  NOTA_CREDITO: "Nota de crédito",
  REMISION: "Remisión",
  PAGO: "Pago",
};

type SingleForm = {
  id: string | null;
  codigo: string;
  nombre: string;
  tipo: string;
  tipo_documento: string;
  folio_actual: string;
  es_default: boolean;
  activa: boolean;
};

const emptySingle = (): SingleForm => ({
  id: null,
  codigo: "",
  nombre: "",
  tipo: "FISCAL",
  tipo_documento: "FACTURA",
  folio_actual: "0",
  es_default: false,
  activa: true,
});

type PairForm = {
  codigo_factura: string;
  codigo_remision: string;
  nombre: string;
  es_default: boolean;
};

const emptyPair = (): PairForm => ({ codigo_factura: "", codigo_remision: "", nombre: "", es_default: false });

export default function SeriesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { post, patch, del, loading: saving } = useMutation();

  const { data, loading, error, reload } = useResource<Page<Serie>>("/api/v1/series?limit=200");
  const rows = data?.items ?? [];

  const [single, setSingle] = useState<SingleForm | null>(null);
  const [pair, setPair] = useState<PairForm | null>(null);
  const [remTouched, setRemTouched] = useState(false);
  const [toDelete, setToDelete] = useState<Serie | null>(null);

  // ── pareja factura + remisión ──
  function openPair() {
    setRemTouched(false);
    setPair(emptyPair());
  }
  function setPairFactura(v: string) {
    const code = v.toUpperCase().replace(/\s/g, "");
    setPair((p) => (p ? { ...p, codigo_factura: code, codigo_remision: remTouched ? p.codigo_remision : code ? `R${code}` : "" } : p));
  }
  async function savePair() {
    if (!pair) return;
    if (!pair.codigo_factura.trim() || !pair.codigo_remision.trim()) {
      toast.error("Indica el código de factura y el de remisión");
      return;
    }
    try {
      await post("/api/v1/series/par", {
        codigo_factura: pair.codigo_factura.trim(),
        codigo_remision: pair.codigo_remision.trim(),
        nombre: pair.nombre.trim() || null,
        es_default: pair.es_default,
      });
      toast.success("Series creadas");
      setPair(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron crear");
    }
  }

  // ── serie individual (crear / editar) ──
  function openCreate() {
    setSingle(emptySingle());
  }
  function openEdit(s: Serie) {
    setSingle({
      id: s.id,
      codigo: s.codigo,
      nombre: s.nombre ?? "",
      tipo: s.tipo,
      tipo_documento: s.tipo_documento,
      folio_actual: String(s.folio_actual),
      es_default: s.es_default,
      activa: s.activa,
    });
  }
  async function saveSingle() {
    if (!single) return;
    if (!single.codigo.trim()) {
      toast.error("El código es obligatorio");
      return;
    }
    const body = {
      codigo: single.codigo.trim(),
      nombre: single.nombre.trim() || null,
      tipo: single.tipo,
      tipo_documento: single.tipo_documento,
      folio_actual: Number(single.folio_actual) || 0,
      es_default: single.es_default,
      activa: single.activa,
    };
    try {
      if (single.id) {
        await patch(`/api/v1/series/${single.id}`, body);
        toast.success("Guardado");
      } else {
        await post("/api/v1/series", body);
        toast.success("Creada");
      }
      setSingle(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del(`/api/v1/series/${toDelete.id}`);
      toast.success("Eliminada");
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  const columns: Column<Serie>[] = [
    { header: "Código", cell: (s) => <span className="font-medium">{s.codigo}</span> },
    { header: "Documento", cell: (s) => DOC_LABEL[s.tipo_documento] ?? s.tipo_documento },
    { header: "Tipo", cell: (s) => (s.tipo === "FISCAL" ? "Fiscal" : "No fiscal") },
    { header: "Próximo folio", cell: (s) => <span className="tabular-nums">{`${s.codigo}${s.folio_actual + 1}`}</span> },
    {
      header: "Predeterminada",
      cell: (s) => (s.es_default ? <Badge tone="success">★ Default</Badge> : <span className="text-muted">—</span>),
    },
    { header: "Estado", cell: (s) => <Badge tone={s.activa ? "success" : "muted"}>{s.activa ? "Activa" : "Inactiva"}</Badge> },
  ];
  if (canWrite) {
    columns.push({
      header: "",
      className: "text-right w-1",
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => openEdit(s)} aria-label="Editar" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
            <Pencil size={16} />
          </button>
          <button onClick={() => setToDelete(s)} aria-label="Eliminar" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title="Series y folios"
        subtitle="Series fiscales (CFDI) y no fiscales (remisión) con folio consecutivo"
        actions={
          canWrite ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={openCreate}>
                <Plus size={16} /> Serie individual
              </Button>
              <Button onClick={openPair}>
                <Layers size={16} /> Nueva pareja (factura + remisión)
              </Button>
            </div>
          ) : undefined
        }
      />

      <DataTable columns={columns} rows={rows} loading={loading} error={error} empty="Sin series" />

      {/* ── Modal: pareja factura + remisión ── */}
      <Modal
        open={pair !== null}
        onClose={() => setPair(null)}
        title="Nueva pareja de series"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPair(null)}>Cancelar</Button>
            <Button onClick={savePair} disabled={saving}>{saving ? "Creando…" : "Crear las dos"}</Button>
          </>
        }
      >
        {pair && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Crea de un golpe la serie de <strong>factura</strong> (fiscal) y la de <strong>remisión</strong> (no fiscal).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Código de factura" required hint="Folios: SLP1, SLP2…">
                <Input placeholder="SLP" value={pair.codigo_factura} onChange={(e) => setPairFactura(e.target.value)} />
              </Field>
              <Field label="Código de remisión" required hint="Folios: RSLP1, RSLP2…">
                <Input
                  placeholder="RSLP"
                  value={pair.codigo_remision}
                  onChange={(e) => { setRemTouched(true); setPair((p) => (p ? { ...p, codigo_remision: e.target.value.toUpperCase().replace(/\s/g, "") } : p)); }}
                />
              </Field>
            </div>
            <Field label="Nombre (opcional)" hint="Se aplica a ambas, p. ej. la plaza o sucursal">
              <Input placeholder="San Luis Potosí" value={pair.nombre} onChange={(e) => setPair({ ...pair, nombre: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Switch checked={pair.es_default} onChange={(v) => setPair({ ...pair, es_default: v })} />
              <span className="text-sm">Usar como predeterminadas (factura y remisión)</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: serie individual (crear / editar) ── */}
      <Modal
        open={single !== null}
        onClose={() => setSingle(null)}
        title={single?.id ? "Editar serie" : "Nueva serie"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSingle(null)}>Cancelar</Button>
            <Button onClick={saveSingle} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </>
        }
      >
        {single && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Código" required hint="Aparece en el folio (p. ej. A128)">
              <Input placeholder="A, R, NC…" value={single.codigo} onChange={(e) => setSingle({ ...single, codigo: e.target.value })} />
            </Field>
            <Field label="Nombre">
              <Input placeholder="Facturas matriz" value={single.nombre} onChange={(e) => setSingle({ ...single, nombre: e.target.value })} />
            </Field>
            <Field label="Naturaleza">
              <Select value={single.tipo} onChange={(e) => setSingle({ ...single, tipo: e.target.value })}>
                <option value="FISCAL">Fiscal (CFDI)</option>
                <option value="NO_FISCAL">No fiscal (remisión)</option>
              </Select>
            </Field>
            <Field label="Documento">
              <Select value={single.tipo_documento} onChange={(e) => setSingle({ ...single, tipo_documento: e.target.value })}>
                <option value="FACTURA">Factura</option>
                <option value="NOTA_CREDITO">Nota de crédito</option>
                <option value="REMISION">Remisión</option>
                <option value="PAGO">Pago</option>
              </Select>
            </Field>
            <Field label="Folio inicial" hint="El primero emitido será este +1">
              <Input type="number" value={single.folio_actual} onChange={(e) => setSingle({ ...single, folio_actual: e.target.value })} />
            </Field>
            <div className="flex flex-col justify-end gap-3 pb-1">
              <div className="flex items-center gap-3">
                <Switch checked={single.es_default} onChange={(v) => setSingle({ ...single, es_default: v })} />
                <span className="text-sm">Predeterminada para su tipo</span>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={single.activa} onChange={(v) => setSingle({ ...single, activa: v })} />
                <span className="text-sm">Activa</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar serie"
        message={`¿Eliminar la serie "${toDelete ? toDelete.codigo : ""}"?`}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
        loading={saving}
      />
    </div>
  );
}
