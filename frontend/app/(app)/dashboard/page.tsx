"use client";

import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { me } = useAuth();
  if (!me) return null;

  const tenant = me.tenants.find(
    (t) => t.tenant_id === me.active_tenant.tenant_id
  );
  const cards = [
    { label: "Empresa", value: tenant?.name ?? "—" },
    { label: "Tu rol", value: me.active_tenant.is_owner ? "OWNER" : me.active_tenant.role },
    { label: "Permisos activos", value: String(me.permissions.length) },
    { label: "Empresas", value: String(me.tenants.length) },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Bienvenido, {me.email}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-background p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-background p-5">
        <div className="text-sm font-medium">Módulos</div>
        <p className="mt-1 text-sm text-muted">
          El menú lateral muestra solo lo que tu rol permite. Empieza por las
          secciones de Catálogo y Operaciones.
        </p>
      </div>
    </div>
  );
}
