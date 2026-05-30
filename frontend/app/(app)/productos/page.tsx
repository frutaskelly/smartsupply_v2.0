"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import { useToast } from "@/components/ui/Toast";
import type { Categoria, Producto } from "@/lib/types";

const WRITE = "producto:gestionar";
const LIMIT = 20;

type FormState = {
  sku: string;
  nombre: string;
  descripcion: string;
  categoria_id: string;
  clave_sat: string;
  unidad_sat: string;
  costo_promedio: string;
  activo: boolean;
  perecedero: boolean;
  requiere_lote: boolean;
};

function emptyForm(): FormState {
  return {
    sku: "",
    nombre: "",
    descripcion: "",
    categoria_id: "",
    clave_sat: "01010101",
    unidad_sat: "KGM",
    costo_promedio: "0",
    activo: true,
    perecedero: false,
    requiere_lote: false,
  };
}

function toForm(p: Producto): FormState {
  return {
    sku: p.sku,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    categoria_id: p.categoria_id ?? "",
    clave_sat: p.clave_sat,
    unidad_sat: p.unidad_sat,
    costo_promedio: p.costo_promedio,
    activo: p.activo,
    perecedero: p.perecedero,
    requiere_lote: p.requiere_lote,
  };
}

export default function ProductosPage() {
  const { me } = useAuth();
  const toast = useToast();
  const { post, patch, del, loading: saving } = useMutation();
  const canWrite = can(me, WRITE);

  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [activo, setActivo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const categoriasRes = useResource<Page<Categoria>>("/api/v1/categorias?limit=200");
  const categorias = categoriasRes.data?.items ?? [];
  const catName = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, c.nombre])),
    [categorias]
  );

  const listPath = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(LIMIT));
    p.set("offset", String(page * LIMIT));
    if (dq.trim()) p.set("q", dq.trim());
    if (categoriaId) p.set("categoria_id", categoriaId);
    if (activo) p.set("activo", activo);
    return `/api/v1/productos?${p.toString()}`;
  }, [page, dq, categoriaId, activo]);

  const { data, loading, error, reload } = useResource<Page<Producto>>(listPath);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Producto | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
  }
  function openEdit(p: Producto) {
    setEditingId(p.id);
    setForm(toForm(p));
  }

  async function save() {
    if (!form) return;
    if (!form.sku.trim() || !form.nombre.trim()) {
      toast.error("SKU y nombre son obligatorios");
      return;
    }
    const payload = {
      sku: form.sku.trim(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria_id: form.categoria_id || null,
      clave_sat: form.clave_sat.trim(),
      unidad_sat: form.unidad_sat.trim(),
      costo_promedio: form.costo_promedio || "0",
      activo: form.activo,
      perecedero: form.perecedero,
      requiere_lote: form.requiere_lote,
    };
    try {
      if (editingId) {
        await patch(`/api/v1/productos/${editingId}`, payload);
        toast.success("Producto actualizado");
      } else {
        await post("/api/v1/productos", payload);
        toast.success("Producto creado");
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
      await del(`/api/v1/productos/${toDelete.id}`);
      toast.success("Producto eliminado");
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  const columns: Column<Producto>[] = [
    { header: "SKU", cell: (p) => <span className="font-medium">{p.sku}</span> },
    { header: "Nombre", cell: (p) => p.nombre },
    { header: "Categoría", cell: (p) => (p.categoria_id ? catName[p.categoria_id] ?? "—" : "—") },
    { header: "Clave SAT", cell: (p) => <span className="text-muted">{p.clave_sat}</span> },
    { header: "Costo prom.", cell: (p) => fmtMoney(p.costo_promedio), className: "text-right" },
    {
      header: "Estado",
      cell: (p) => <Badge tone={p.activo ? "success" : "muted"}>{p.activo ? "Activo" : "Inactivo"}</Badge>,
    },
    {
      header: "",
      className: "text-right w-1",
      cell: (p) =>
        canWrite ? (
          <div className="flex justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEdit(p);
              }}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="Editar"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToDelete(p);
              }}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
              aria-label="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null,
    },
  ];

  const from = total === 0 ? 0 : page * LIMIT + 1;
  const to = Math.min((page + 1) * LIMIT, total);

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Catálogo de productos"
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus size={16} /> Nuevo producto
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por SKU, nombre o RFC…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={categoriaId}
          onChange={(e) => {
            setCategoriaId(e.target.value);
            setPage(0);
          }}
          className="max-w-[12rem]"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <Select
          value={activo}
          onChange={(e) => {
            setActivo(e.target.value);
            setPage(0);
          }}
          className="max-w-[10rem]"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} error={error} empty="Sin productos" />

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
        title={editingId ? "Editar producto" : "Nuevo producto"}
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
            <Field label="SKU" required>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Nombre" required>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <Select
                value={form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              >
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Costo promedio">
              <Input
                type="number"
                step="0.0001"
                value={form.costo_promedio}
                onChange={(e) => setForm({ ...form, costo_promedio: e.target.value })}
              />
            </Field>
            <Field label="Clave SAT" hint="Clave de producto/servicio SAT">
              <Input value={form.clave_sat} onChange={(e) => setForm({ ...form, clave_sat: e.target.value })} />
            </Field>
            <Field label="Unidad SAT" hint="p.ej. KGM, H87">
              <Input value={form.unidad_sat} onChange={(e) => setForm({ ...form, unidad_sat: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <Textarea
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activo} onChange={(v) => setForm({ ...form, activo: v })} />
              <span className="text-sm">Activo</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.perecedero} onChange={(v) => setForm({ ...form, perecedero: v })} />
              <span className="text-sm">Perecedero</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.requiere_lote} onChange={(v) => setForm({ ...form, requiere_lote: v })} />
              <span className="text-sm">Requiere lote</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar producto"
        message={`¿Eliminar "${toDelete?.nombre}"? Se puede recrear después.`}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
        loading={saving}
      />
    </div>
  );
}
