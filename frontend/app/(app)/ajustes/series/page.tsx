"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTableSmart, type Column } from "@/components/ui/DataTableSmart";
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

// Lo que el usuario elige crear. "COMBO" crea la pareja factura + remisión.
type Kind = "FACTURA" | "REMISION" | "NOTA_CREDITO" | "PAGO" | "COMBO";

const KIND_LABEL: Record<Kind, string> = {
  FACTURA: "Factura (fiscal)",
  REMISION: "Remisión (no fiscal)",
  NOTA_CREDITO: "Nota de crédito (fiscal)",
  PAGO: "Complemento de pago (fiscal)",
  COMBO: "Combo: factura + remisión",
};

// Naturaleza fiscal inferida del tipo de documento (no se pregunta: una factura
// siempre es CFDI, una remisión nunca lo es).
const NATURALEZA: Record<Exclude<Kind, "COMBO">, "FISCAL" | "NO_FISCAL"> = {
  FACTURA: "FISCAL",
  NOTA_CREDITO: "FISCAL",
  PAGO: "FISCAL",
  REMISION: "NO_FISCAL",
};

// Código sugerido por tipo (se puede sobrescribir).
const SUGGEST: Record<Exclude<Kind, "COMBO">, string> = {
  FACTURA: "A",
  REMISION: "R",
  NOTA_CREDITO: "NC",
  PAGO: "P",
};
const SUGGEST_VALUES = new Set(Object.values(SUGGEST));

type FormState = {
  id: string | null; // null = creando, set = editando
  kind: Kind;
  // individual
  codigo: string;
  nombre: string;
  folio_actual: string;
  es_default: boolean;
  activa: boolean;
  // combo
  codigo_factura: string;
  codigo_remision: string;
  remTouched: boolean;
  folio_factura: string;
  folio_remision: string;
};

const emptyForm = (): FormState => ({
  id: null,
  kind: "FACTURA",
  codigo: "A",
  nombre: "",
  folio_actual: "0",
  es_default: false,
  activa: true,
  codigo_factura: "",
  codigo_remision: "",
  remTouched: false,
  folio_factura: "0",
  folio_remision: "0",
});

export default function SeriesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { post, patch, del, loading: saving } = useMutation();

  const { data, loading, error, reload } = useResource<Page<Serie>>("/api/v1/series?limit=200");
  const rows = data?.items ?? [];

  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<Serie | null>(null);

  const isEdit = form?.id != null;
  const isCombo = form?.kind === "COMBO";

  function openCreate() {
    setForm(emptyForm());
  }
  function openEdit(s: Serie) {
    setForm({
      ...emptyForm(),
      id: s.id,
      kind: s.tipo_documento as Kind,
      codigo: s.codigo,
      nombre: s.nombre ?? "",
      folio_actual: String(s.folio_actual),
      es_default: s.es_default,
      activa: s.activa,
    });
  }

  function changeKind(kind: Kind) {
    setForm((f) => {
      if (!f) return f;
      // al cambiar el tipo, actualiza el código sugerido si el usuario no lo tocó
      let codigo = f.codigo;
      if (kind !== "COMBO" && (codigo.trim() === "" || SUGGEST_VALUES.has(codigo))) {
        codigo = SUGGEST[kind];
      }
      return { ...f, kind, codigo };
    });
  }

  function setFactura(v: string) {
    const code = v.toUpperCase().replace(/\s/g, "");
    setForm((f) =>
      f ? { ...f, codigo_factura: code, codigo_remision: f.remTouched ? f.codigo_remision : code ? `R${code}` : "" } : f,
    );
  }

  async function save() {
    if (!form) return;
    try {
      if (form.kind === "COMBO") {
        if (!form.codigo_factura.trim() || !form.codigo_remision.trim()) {
          toast.error("Indica el código de factura y el de remisión");
          return;
        }
        await post("/api/v1/series/par", {
          codigo_factura: form.codigo_factura.trim(),
          codigo_remision: form.codigo_remision.trim(),
          nombre: form.nombre.trim() || null,
          es_default: form.es_default,
          folio_inicial_factura: Number(form.folio_factura) || 0,
          folio_inicial_remision: Number(form.folio_remision) || 0,
        });
        toast.success("Series creadas");
      } else if (form.id) {
        // edición: el backend sólo permite cambiar nombre/folio/default/activa
        await patch(`/api/v1/series/${form.id}`, {
          nombre: form.nombre.trim() || null,
          folio_actual: Number(form.folio_actual) || 0,
          es_default: form.es_default,
          activa: form.activa,
        });
        toast.success("Guardado");
      } else {
        if (!form.codigo.trim()) {
          toast.error("El código es obligatorio");
          return;
        }
        await post("/api/v1/series", {
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim() || null,
          tipo: NATURALEZA[form.kind],
          tipo_documento: form.kind,
          folio_actual: Number(form.folio_actual) || 0,
          es_default: form.es_default,
          activa: form.activa,
        });
        toast.success("Creada");
      }
      setForm(null);
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
    { header: "Código", cell: (s) => <span className="font-medium">{s.codigo}</span>, sortable: true, sortValue: (s) => s.codigo },
    { header: "Documento", cell: (s) => DOC_LABEL[s.tipo_documento] ?? s.tipo_documento, sortable: true, sortValue: (s) => DOC_LABEL[s.tipo_documento] ?? s.tipo_documento },
    { header: "Tipo", cell: (s) => (s.tipo === "FISCAL" ? "Fiscal" : "No fiscal"), sortable: true, sortValue: (s) => s.tipo },
    { header: "Próximo folio", cell: (s) => <span className="tabular-nums">{`${s.codigo}${s.folio_actual + 1}`}</span> },
    {
      header: "Predeterminada",
      cell: (s) => (s.es_default ? <Badge tone="success">★ Default</Badge> : <span className="text-muted">—</span>),
    },
    { header: "Estado", cell: (s) => <Badge tone={s.activa ? "success" : "muted"}>{s.activa ? "Activa" : "Inactiva"}</Badge>, sortable: true, sortValue: (s) => (s.activa ? "Activa" : "Inactiva") },
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
            <Button onClick={openCreate}>
              <Plus size={16} /> Nueva serie
            </Button>
          ) : undefined
        }
      />

      <DataTableSmart
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        empty="Sin series"
        columnsMenu
        exportable
        exportFilename="series"
        storageKey="series"
      />

      {/* ── Modal único: nueva serie / editar ── */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={isEdit ? "Editar serie" : "Nueva serie"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : isCombo ? "Crear las dos" : isEdit ? "Guardar" : "Crear serie"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label="Tipo de serie" hint={isEdit ? "El tipo no se puede cambiar al editar" : "Qué documento numerará esta serie"}>
              <Select
                value={form.kind}
                onChange={(e) => changeKind(e.target.value as Kind)}
                disabled={isEdit}
              >
                <option value="FACTURA">{KIND_LABEL.FACTURA}</option>
                <option value="REMISION">{KIND_LABEL.REMISION}</option>
                <option value="NOTA_CREDITO">{KIND_LABEL.NOTA_CREDITO}</option>
                <option value="PAGO">{KIND_LABEL.PAGO}</option>
                <option value="COMBO">{KIND_LABEL.COMBO}</option>
              </Select>
            </Field>

            {isCombo ? (
              <>
                <p className="text-sm text-muted">
                  Crea de un golpe la serie de <strong>factura</strong> (fiscal) y la de <strong>remisión</strong> (no fiscal).
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Código de factura" required hint="Folios: SLP1, SLP2…">
                    <Input placeholder="SLP" value={form.codigo_factura} onChange={(e) => setFactura(e.target.value)} />
                  </Field>
                  <Field label="Código de remisión" required hint="Folios: RSLP1, RSLP2…">
                    <Input
                      placeholder="RSLP"
                      value={form.codigo_remision}
                      onChange={(e) => setForm((f) => (f ? { ...f, remTouched: true, codigo_remision: e.target.value.toUpperCase().replace(/\s/g, "") } : f))}
                    />
                  </Field>
                  <Field label="Folio inicial factura" hint="El primero será este +1">
                    <Input type="number" value={form.folio_factura} onChange={(e) => setForm({ ...form, folio_factura: e.target.value })} />
                  </Field>
                  <Field label="Folio inicial remisión" hint="El primero será este +1">
                    <Input type="number" value={form.folio_remision} onChange={(e) => setForm({ ...form, folio_remision: e.target.value })} />
                  </Field>
                </div>
                <Field label="Nombre (opcional)" hint="Se aplica a ambas, p. ej. la plaza o sucursal">
                  <Input placeholder="San Luis Potosí" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </Field>
                <div className="flex items-center gap-3">
                  <Switch checked={form.es_default} onChange={(v) => setForm({ ...form, es_default: v })} />
                  <span className="text-sm">Usar como predeterminadas (factura y remisión)</span>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Código" required hint="Aparece en el folio (p. ej. A128)">
                  <Input
                    placeholder="A, R, NC…"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase().replace(/\s/g, "") })}
                    disabled={isEdit}
                  />
                </Field>
                <Field label="Nombre">
                  <Input placeholder="Facturas matriz" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </Field>
                <Field label="Folio inicial" hint="El primero emitido será este +1">
                  <Input type="number" value={form.folio_actual} onChange={(e) => setForm({ ...form, folio_actual: e.target.value })} />
                </Field>
                <div className="flex flex-col justify-end gap-3 pb-1">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.es_default} onChange={(v) => setForm({ ...form, es_default: v })} />
                    <span className="text-sm">Predeterminada para su tipo</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={form.activa} onChange={(v) => setForm({ ...form, activa: v })} />
                    <span className="text-sm">Activa</span>
                  </div>
                </div>
              </div>
            )}
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
