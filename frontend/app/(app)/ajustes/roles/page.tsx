"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Eye, Lock, Pencil, Plus, Shield, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTableSmart, type Column } from "@/components/ui/DataTableSmart";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { useMutation, useResource } from "@/lib/hooks";
import type { Permission, Role, RoleDetail } from "@/lib/types";

const WRITE = "role:gestionar";

/** Humanize an action segment ("ajustes.usuarios" → "Ajustes · Usuarios"). */
function humanize(s: string): string {
  return s
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

const RECURSO_LABEL: Record<string, string> = {
  producto: "Productos",
  categoria: "Categorías",
  esquema_impuesto: "Esquemas de impuesto",
  lista_precios: "Listas de precios",
  cliente: "Clientes",
  proveedor: "Proveedores",
  almacen: "Almacenes",
  inventario: "Inventario",
  compra: "Compras",
  conversion: "Conversiones",
  remision: "Remisiones",
  pedido: "Pedidos (POS)",
  devolucion: "Devoluciones (POS)",
  role: "Roles",
  membership: "Usuarios / Membresías",
};

export default function RolesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { post, patch, del, loading: saving } = useMutation();

  const rolesRes = useResource<Role[]>("/api/v1/roles");
  const permsRes = useResource<Permission[]>("/api/v1/permissions");
  const roles = rolesRes.data ?? [];
  const perms = permsRes.data ?? [];

  // Split the catalog into module-visibility (menu:*) and grouped actions.
  const { modules, actionGroups } = useMemo(() => {
    const modules = perms
      .filter((p) => p.recurso === "menu")
      .sort((a, b) => a.accion.localeCompare(b.accion));
    const byRecurso: Record<string, Permission[]> = {};
    for (const p of perms) {
      if (p.recurso === "menu") continue;
      (byRecurso[p.recurso] ??= []).push(p);
    }
    const actionGroups = Object.entries(byRecurso)
      .map(([recurso, items]) => ({
        recurso,
        label: RECURSO_LABEL[recurso] ?? humanize(recurso),
        items: items.sort((a, b) => a.accion.localeCompare(b.accion)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { modules, actionGroups };
  }, [perms]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Role | null>(null);

  function openNew() {
    setEditing(null);
    setReadOnly(false);
    setNombre("");
    setDescripcion("");
    setSelected(new Set());
    setOpen(true);
  }

  async function openRole(role: Role) {
    setEditing(role);
    setReadOnly(role.es_preset || !canWrite);
    setNombre(role.nombre);
    setDescripcion(role.descripcion ?? "");
    setSelected(new Set());
    setOpen(true);
    setLoadingDetail(true);
    try {
      const detail = await apiFetch<RoleDetail>(`/api/v1/roles/${role.id}`);
      setSelected(new Set(detail.permissions));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el rol");
    } finally {
      setLoadingDetail(false);
    }
  }

  function toggle(id: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!nombre.trim()) {
      toast.error("El nombre del rol es obligatorio");
      return;
    }
    const payload = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      permissions: [...selected],
    };
    try {
      if (editing) {
        await patch(`/api/v1/roles/${editing.id}`, payload);
        toast.success("Rol actualizado");
      } else {
        await post("/api/v1/roles", payload);
        toast.success("Rol creado");
      }
      setOpen(false);
      rolesRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del(`/api/v1/roles/${toDelete.id}`);
      toast.success("Rol eliminado");
      setToDelete(null);
      rolesRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  const columns: Column<Role>[] = [
    {
      header: "Rol",
      cell: (r) => (
        <span className="flex items-center gap-2 font-medium">
          <Shield size={15} className="text-muted" />
          {r.nombre}
        </span>
      ),
    },
    {
      header: "Tipo",
      cell: (r) =>
        r.es_preset ? <Badge tone="muted">Predefinido</Badge> : <Badge tone="success">Personalizado</Badge>,
    },
    { header: "Descripción", cell: (r) => <span className="text-muted">{r.descripcion ?? "—"}</span> },
    {
      header: "",
      className: "text-right w-1",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openRole(r);
            }}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label={r.es_preset ? "Ver" : "Editar"}
          >
            {r.es_preset || !canWrite ? <Eye size={16} /> : <Pencil size={16} />}
          </button>
          {canWrite && !r.es_preset && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToDelete(r);
              }}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
              aria-label="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Roles y permisos"
        subtitle="Define qué puede ver y hacer cada rol. Los roles predefinidos son de solo lectura."
        actions={
          canWrite ? (
            <Button onClick={openNew}>
              <Plus size={16} /> Nuevo rol
            </Button>
          ) : undefined
        }
      />

      <DataTableSmart
        columns={columns}
        rows={roles}
        loading={rolesRes.loading}
        error={rolesRes.error}
        empty="Sin roles"
        onRowClick={(r) => openRole(r)}
        storageKey="roles"
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={
          editing ? (readOnly ? `Rol: ${editing.nombre}` : `Editar rol: ${editing.nombre}`) : "Nuevo rol"
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button onClick={save} disabled={saving || loadingDetail}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {readOnly && (
            <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
              <Lock size={14} /> Rol predefinido del sistema — solo lectura.
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Descripción">
              <Input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                disabled={readOnly}
              />
            </Field>
          </div>

          {loadingDetail ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              <PermSection title="Módulos visibles" hint="Qué secciones puede abrir el rol">
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {modules.map((p) => (
                    <PermCheck
                      key={p.id}
                      label={humanize(p.accion)}
                      checked={selected.has(p.id)}
                      disabled={readOnly}
                      onChange={() => toggle(p.id)}
                    />
                  ))}
                </div>
              </PermSection>

              <PermSection title="Acciones" hint="Qué operaciones puede ejecutar el rol">
                <div className="space-y-3">
                  {actionGroups.map((g) => (
                    <div key={g.recurso}>
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                        {g.label}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {g.items.map((p) => (
                          <PermCheck
                            key={p.id}
                            label={p.descripcion ?? humanize(p.accion)}
                            checked={selected.has(p.id)}
                            disabled={readOnly}
                            onChange={() => toggle(p.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PermSection>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar rol"
        message={`¿Eliminar el rol "${toDelete?.nombre}"? Si está asignado a usuarios, reasígnalos primero.`}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
        loading={saving}
      />
    </div>
  );
}

function PermSection({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function PermCheck({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        disabled ? "opacity-70" : "cursor-pointer hover:bg-surface-2"
      }`}
    >
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
