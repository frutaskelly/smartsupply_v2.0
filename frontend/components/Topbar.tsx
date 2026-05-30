"use client";

import { LogOut } from "lucide-react";

import type { Me } from "@/lib/auth";

export function Topbar({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const tenant = me.tenants.find(
    (t) => t.tenant_id === me.active_tenant.tenant_id
  );
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="text-sm font-medium text-muted">{tenant?.name ?? "—"}</div>
      <div className="flex items-center gap-4">
        <div className="text-right leading-tight">
          <div className="text-sm font-medium">{me.email}</div>
          <div className="text-xs text-muted">
            {me.active_tenant.role}
            {me.active_tenant.is_owner ? " · OWNER" : ""}
          </div>
        </div>
        <button
          onClick={onSignOut}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
