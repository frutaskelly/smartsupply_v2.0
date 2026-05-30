"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, me, loading, accessError, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">
        Cargando…
      </div>
    );
  }

  if (!session) return null; // redirecting to /login

  if (accessError || !me) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-medium">Sin acceso</p>
        <p className="max-w-sm text-sm text-muted">
          {accessError ?? "Tu cuenta aún no está provisionada."} Contacta al
          operador de la plataforma.
        </p>
        <button
          onClick={signOut}
          className="mt-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2"
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar me={me} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar me={me} onSignOut={signOut} />
        <main className="flex-1 overflow-auto bg-surface p-6">{children}</main>
      </div>
    </div>
  );
}
