"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";

import { useOnboarding } from "@/components/OnboardingChecklist";
import { can, useAuth } from "@/lib/auth";

const WRITE = "membership:gestionar";

/**
 * Aviso persistente cuando la empresa aún no está lista para facturar. Solo se
 * muestra a quien puede configurar (Ajustes) y desaparece al completar el setup.
 * Se oculta en la propia pantalla de configuración para no duplicar el mensaje.
 */
export function OnboardingBanner({ pathname }: { pathname: string }) {
  const { me } = useAuth();
  const canWrite = can(me, WRITE);
  const { status, loading } = useOnboarding(undefined, canWrite);

  if (!canWrite || loading || !status || status.listo_para_facturar) return null;
  if (pathname.startsWith("/ajustes/empresa") || pathname.startsWith("/onboarding")) return null;

  const faltan = status.pasos.filter((p) => !p.completo).map((p) => p.titulo);

  return (
    <Link
      href="/onboarding"
      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 transition hover:bg-amber-100"
    >
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">
        <span className="font-medium">Completa la configuración de tu empresa</span> para
        emitir facturas a tu nombre
        {faltan.length > 0 && <> — falta: {faltan.join(", ")}</>}.
      </span>
      <ArrowRight size={16} className="shrink-0" />
    </Link>
  );
}
