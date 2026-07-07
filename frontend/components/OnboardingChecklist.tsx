"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";

export type OnboardingPaso = {
  id: string;
  titulo: string;
  completo: boolean;
  detalle: string;
};

export type OnboardingStatus = {
  datos_fiscales_completos: boolean;
  rfc: string;
  csd_cargado: boolean;
  csd: Record<string, unknown> | null;
  multiemisor: boolean;
  listo_para_facturar: boolean;
  pasos: OnboardingPaso[];
  ambiente: "sandbox" | "producción";
};

/**
 * Lee el estado de onboarding fiscal del tenant. `refreshKey` fuerza recarga.
 * `enabled=false` evita la llamada (p. ej. usuarios sin permiso de Ajustes).
 */
export function useOnboarding(refreshKey?: number, enabled = true) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    apiFetch<OnboardingStatus>("/api/v1/empresa/onboarding")
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatus(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey, enabled]);

  return { status, loading };
}

/** Checklist de pasos de configuración fiscal con estado de "listo para facturar". */
export function OnboardingChecklist({ refreshKey }: { refreshKey?: number }) {
  const { status, loading } = useOnboarding(refreshKey);
  if (loading || !status) return null;

  const total = status.pasos.length;
  const hechos = status.pasos.filter((p) => p.completo).length;

  return (
    <Card
      title="Configuración para facturar"
      subtitle={`${hechos} de ${total} pasos completos`}
      actions={
        status.listo_para_facturar ? (
          <Badge tone="success">
            <CheckCircle2 size={12} className="mr-1" /> Listo para facturar
          </Badge>
        ) : (
          <Badge tone="warning">Configuración pendiente</Badge>
        )
      }
    >
      <ol className="space-y-3">
        {status.pasos.map((p, i) => (
          <li key={p.id} className="flex items-start gap-3">
            {p.completo ? (
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <Circle size={20} className="mt-0.5 shrink-0 text-muted" />
            )}
            <div>
              <div className="text-sm font-medium">
                <span className="text-muted">{i + 1}.</span> {p.titulo}
              </div>
              <div className="text-xs text-muted">{p.detalle}</div>
            </div>
          </li>
        ))}
      </ol>
      {!status.listo_para_facturar && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
          Completa los pasos pendientes abajo para poder emitir facturas a tu nombre.
        </p>
      )}
    </Card>
  );
}
