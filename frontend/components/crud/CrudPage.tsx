"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { useMutation, useResource, type Page } from "@/lib/hooks";

export type FormValues = Record<string, string | boolean>;

export type CrudField = {
  name: string;
  label: string;
  type?: "text" | "number" | "decimal" | "textarea" | "switch" | "select";
  required?: boolean;
  hint?: string;
  step?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  colSpan?: 1 | 2;
  /** Campo no editable (se muestra deshabilitado). */
  readOnly?: boolean;
  /** Valor derivado de otros campos; se recalcula al cambiar el formulario. */
  derive?: (form: FormValues) => string;
};

/** A select whose options come from another list endpoint. */
export type Lookup = {
  path: string;
  value: (row: Record<string, unknown>) => string;
  label: (row: Record<string, unknown>) => string;
};

export type CrudConfig<T> = {
  title: string;
  subtitle?: string;
  basePath: string;
  writePerm: string;
  searchable?: boolean;
  deletable?: boolean;
  columns: Column<T>[];
  fields: CrudField[];
  newValues: () => FormValues;
  toForm: (row: T) => FormValues;
  toPayload: (v: FormValues) => Record<string, unknown>;
  rowLabel: (row: T) => string;
  lookups?: Record<string, Lookup>;
  /** Advertencia opcional al eliminar (impacto + alternativa). Si devuelve texto,
   * se muestra en el diálogo de confirmación antes de borrar. */
  deleteWarning?: (row: T) => Promise<string | null>;
};

const LIMIT = 20;

export function CrudPage<T extends { id: string }>({ config }: { config: CrudConfig<T> }) {
  const { me } = useAuth();
  const toast = useToast();
  const { post, patch, del, loading: saving } = useMutation();
  const canWrite = can(me, config.writePerm);

  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const listPath = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(LIMIT));
    p.set("offset", String(page * LIMIT));
    if (config.searchable && dq.trim()) p.set("q", dq.trim());
    return `${config.basePath}?${p.toString()}`;
  }, [config.basePath, config.searchable, page, dq]);

  const { data, loading, error, reload } = useResource<Page<T>>(listPath);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const [lookupOpts, setLookupOpts] = useState<Record<string, { value: string; label: string }[]>>({});
  const lookupsLoaded = useRef(false);

  const [deleteWarn, setDeleteWarn] = useState<string | null>(null);
  function askDelete(row: T) {
    setDeleteWarn(null);
    setToDelete(row);
    config.deleteWarning?.(row).then(setDeleteWarn).catch(() => setDeleteWarn(null));
  }

  const [form, setForm] = useState<FormValues | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<T | null>(null);

  // Lookups de los selects del formulario: se cargan la primera vez que se abre
  // el formulario, no al montar la página (ahorra peticiones en la carga inicial).
  useEffect(() => {
    if (!config.lookups || form === null || lookupsLoaded.current) return;
    lookupsLoaded.current = true;
    let active = true;
    (async () => {
      const out: Record<string, { value: string; label: string }[]> = {};
      for (const [field, lk] of Object.entries(config.lookups!)) {
        try {
          const pageData = await apiFetch<Page<Record<string, unknown>>>(lk.path);
          out[field] = pageData.items.map((r) => ({ value: lk.value(r), label: lk.label(r) }));
        } catch {
          out[field] = [];
        }
      }
      if (active) setLookupOpts(out);
    })();
    return () => {
      active = false;
    };
  }, [config.lookups, form]);

  function openCreate() {
    setEditingId(null);
    setForm(config.newValues());
  }
  function openEdit(row: T) {
    setEditingId(row.id);
    setForm(config.toForm(row));
  }
  function setField(name: string, value: string | boolean) {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [name]: value };
      for (const fld of config.fields) {
        if (fld.derive) next[fld.name] = fld.derive(next);
      }
      return next;
    });
  }

  async function save() {
    if (!form) return;
    for (const f of config.fields) {
      const v = form[f.name];
      if (f.required && typeof v === "string" && !v.trim()) {
        toast.error(`${f.label} es obligatorio`);
        return;
      }
    }
    try {
      const payload = config.toPayload(form);
      if (editingId) {
        await patch(`${config.basePath}/${editingId}`, payload);
        toast.success("Guardado");
      } else {
        await post(config.basePath, payload);
        toast.success("Creado");
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
      await del(`${config.basePath}/${toDelete.id}`);
      toast.success("Eliminado");
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  const actionsCol: Column<T> = {
    header: "",
    className: "text-right w-1",
    cell: (row) => (
      <div className="flex justify-end gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openEdit(row);
          }}
          aria-label="Editar"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <Pencil size={16} />
        </button>
        {config.deletable !== false && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              askDelete(row);
            }}
            aria-label="Eliminar"
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    ),
  };
  const columns = canWrite ? [...config.columns, actionsCol] : config.columns;

  const from = total === 0 ? 0 : page * LIMIT + 1;
  const to = Math.min((page + 1) * LIMIT, total);
  const lower = config.title.toLowerCase();

  return (
    <div>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus size={16} /> Nuevo
            </Button>
          ) : undefined
        }
      />

      {config.searchable && (
        <div className="mb-4">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </div>
      )}

      <DataTable columns={columns} rows={rows} loading={loading} error={error} empty="Sin resultados" />

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>
          {from}–{to} de {total}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button variant="secondary" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={editingId ? `Editar ${lower}` : `Nuevo ${lower}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {config.fields.map((f) => {
              const val = form[f.name];
              const opts = f.options ?? lookupOpts[f.name] ?? [];
              const cls = f.colSpan === 2 ? "sm:col-span-2" : "";
              if (f.type === "switch") {
                return (
                  <div key={f.name} className={`flex items-center gap-3 pt-6 ${cls}`}>
                    <Switch checked={Boolean(val)} onChange={(v) => setField(f.name, v)} />
                    <span className="text-sm">{f.label}</span>
                  </div>
                );
              }
              return (
                <div key={f.name} className={cls}>
                  <Field label={f.label} required={f.required} hint={f.hint}>
                    {f.type === "textarea" ? (
                      <Textarea rows={2} value={String(val ?? "")} onChange={(e) => setField(f.name, e.target.value)} />
                    ) : f.type === "select" ? (
                      <Select value={String(val ?? "")} onChange={(e) => setField(f.name, e.target.value)}>
                        <option value="">— Selecciona —</option>
                        {opts.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      // `decimal` usa un input de texto (no el nativo `number`,
                      // que muestra el separador decimal según el locale del SO
                      // y acaba pintando "0,0000"). Aquí siempre se usa punto.
                      <Input
                        type={f.type === "number" ? "number" : "text"}
                        inputMode={f.type === "decimal" ? "decimal" : undefined}
                        step={f.step}
                        placeholder={f.placeholder}
                        value={String(val ?? "")}
                        onChange={(e) =>
                          setField(
                            f.name,
                            f.type === "decimal" ? e.target.value.replace(",", ".") : e.target.value,
                          )
                        }
                        disabled={f.readOnly}
                        readOnly={f.readOnly}
                      />
                    )}
                  </Field>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Eliminar ${lower}`}
        message={
          deleteWarn
            ? `⚠️ ${deleteWarn}`
            : `¿Eliminar "${toDelete ? config.rowLabel(toDelete) : ""}"? Esta acción no se puede deshacer fácilmente.`
        }
        confirmLabel={deleteWarn ? "Eliminar de todas formas" : "Eliminar"}
        onConfirm={confirmDelete}
        onClose={() => { setToDelete(null); setDeleteWarn(null); }}
        loading={saving}
      />
    </div>
  );
}
