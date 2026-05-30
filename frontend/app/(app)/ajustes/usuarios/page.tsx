"use client";

import { useState } from "react";
import { Trash2, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Select, Switch } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { useMutation, useResource } from "@/lib/hooks";
import type { Membership, Role } from "@/lib/types";

const WRITE = "membership:gestionar";

export default function UsuariosPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { patch, del } = useMutation();

  const membersRes = useResource<Membership[]>("/api/v1/memberships");
  const rolesRes = useResource<Role[]>("/api/v1/roles");
  const members = membersRes.data ?? [];
  const roles = rolesRes.data ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<Membership | null>(null);

  const isSelf = (m: Membership) => m.user_id === me?.user_id;

  async function changeRole(m: Membership, roleId: string) {
    if (roleId === m.role_id) return;
    setBusyId(m.id);
    try {
      await patch(`/api/v1/memberships/${m.id}`, { role_id: roleId });
      toast.success("Rol actualizado");
      membersRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar el rol");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(m: Membership, active: boolean) {
    setBusyId(m.id);
    try {
      await patch(`/api/v1/memberships/${m.id}`, { active });
      toast.success(active ? "Usuario activado" : "Usuario desactivado");
      membersRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setBusyId(toRemove.id);
    try {
      await del(`/api/v1/memberships/${toRemove.id}`);
      toast.success("Usuario removido del inquilino");
      setToRemove(null);
      membersRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo remover");
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Membership>[] = [
    {
      header: "Usuario",
      cell: (m) => (
        <div>
          <div className="font-medium">{m.user_full_name || m.user_email}</div>
          {m.user_full_name && <div className="text-xs text-muted">{m.user_email}</div>}
        </div>
      ),
    },
    {
      header: "Rol",
      cell: (m) =>
        canWrite && !isSelf(m) ? (
          <Select
            value={m.role_id}
            disabled={busyId === m.id}
            onChange={(e) => changeRole(m, e.target.value)}
            className="max-w-[14rem]"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.es_preset ? "" : " (personalizado)"}
              </option>
            ))}
          </Select>
        ) : (
          <span className="flex items-center gap-2">
            {m.role_nombre}
            {isSelf(m) && <Badge tone="muted">tú</Badge>}
          </span>
        ),
    },
    {
      header: "Estado",
      cell: (m) =>
        canWrite && !isSelf(m) ? (
          <div className="flex items-center gap-2">
            <Switch checked={m.active} onChange={(v) => toggleActive(m, v)} />
            <span className="text-sm text-muted">{m.active ? "Activo" : "Inactivo"}</span>
          </div>
        ) : (
          <Badge tone={m.active ? "success" : "muted"}>{m.active ? "Activo" : "Inactivo"}</Badge>
        ),
    },
    {
      header: "",
      className: "text-right w-1",
      cell: (m) =>
        canWrite && !isSelf(m) ? (
          <button
            onClick={() => setToRemove(m)}
            disabled={busyId === m.id}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
            aria-label="Remover"
          >
            <Trash2 size={16} />
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Asigna roles a los miembros de tu empresa, actívalos o remuévelos."
      />

      {members.length === 0 && !membersRes.loading ? (
        <div className="rounded-xl border border-border p-8 text-center text-sm text-muted">
          <UserCog className="mx-auto mb-2 text-muted" size={28} />
          Aún no hay otros usuarios. El alta de nuevos usuarios se realiza durante el aprovisionamiento.
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={members}
          loading={membersRes.loading}
          error={membersRes.error}
          empty="Sin usuarios"
        />
      )}

      <ConfirmDialog
        open={toRemove !== null}
        title="Remover usuario"
        message={`¿Remover a "${toRemove?.user_email}" de esta empresa? Perderá acceso, pero puede volver a invitarse.`}
        onConfirm={confirmRemove}
        onClose={() => setToRemove(null)}
        loading={busyId === toRemove?.id}
      />
    </div>
  );
}
