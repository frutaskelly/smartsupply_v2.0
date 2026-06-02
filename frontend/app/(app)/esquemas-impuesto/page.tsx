"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { EsquemaImpuesto } from "@/lib/types";

// Fracción (0.16) → porcentaje legible sin redondear a entero. Conserva
// decimales reales de las retenciones (ISR 1.25%, IVA 10.6667%) y limpia el
// ruido de punto flotante. 0.16 → "16", 0.0125 → "1.25".
const pct = (frac: unknown): string => String(+(Number(frac) * 100).toFixed(4));

const config: CrudConfig<EsquemaImpuesto> = {
  title: "Esquemas de impuesto",
  subtitle: "Tasas de IVA / IEPS y retenciones",
  newLabel: "Nuevo esquema de impuesto",
  basePath: "/api/v1/esquemas-impuesto",
  writePerm: "esquema_impuesto:gestionar",
  columns: [
    { header: "Código", cell: (e) => <span className="font-medium">{e.codigo}</span> },
    { header: "Nombre", cell: (e) => e.nombre },
    { header: "IVA", cell: (e) => `${pct(e.iva_tasa)}%`, className: "text-right" },
    { header: "IEPS", cell: (e) => `${pct(e.ieps_tasa)}%`, className: "text-right" },
    { header: "Exento", cell: (e) => (e.iva_exento ? "Sí" : "No") },
    { header: "Estado", cell: (e) => <Badge tone={e.activo ? "success" : "muted"}>{e.activo ? "Activo" : "Inactivo"}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código", readonly: true, hint: "Se genera automáticamente" },
    { name: "nombre", label: "Nombre", required: true },
    { name: "descripcion", label: "Descripción", type: "textarea", colSpan: 2 },
    { name: "iva_tasa", label: "Tasa IVA (%)", type: "number", step: "0.01", hint: "16 = 16%. Admite decimales." },
    { name: "ieps_tasa", label: "Tasa IEPS (%)", type: "number", step: "0.01", hint: "8 = 8%. Admite decimales." },
    { name: "retencion_iva_tasa", label: "Retención IVA (%)", type: "number", step: "0.0001", hint: "Ej. 10.6667" },
    { name: "retencion_isr_tasa", label: "Retención ISR (%)", type: "number", step: "0.01", hint: "Ej. 1.25" },
    { name: "iva_exento", label: "IVA exento", type: "switch" },
    { name: "activo", label: "Activo", type: "switch" },
  ],
  newValues: () => ({
    codigo: "",
    nombre: "",
    descripcion: "",
    iva_tasa: "0",
    ieps_tasa: "0",
    retencion_iva_tasa: "0",
    retencion_isr_tasa: "0",
    iva_exento: false,
    activo: true,
  }),
  toForm: (e) => ({
    codigo: e.codigo,
    nombre: e.nombre,
    descripcion: e.descripcion ?? "",
    // El backend guarda fracción (0.16); el form usa % (16), con decimales.
    iva_tasa: pct(e.iva_tasa),
    ieps_tasa: pct(e.ieps_tasa),
    retencion_iva_tasa: pct(e.retencion_iva_tasa),
    retencion_isr_tasa: pct(e.retencion_isr_tasa),
    iva_exento: e.iva_exento,
    activo: e.activo,
  }),
  toPayload: (v) => ({
    // `codigo` lo autogenera el backend (ESQ-NNN); no se envía.
    nombre: v.nombre,
    descripcion: (v.descripcion as string) || null,
    // % entero del form → fracción que espera el backend (16 → 0.16).
    iva_tasa: (Number(v.iva_tasa) || 0) / 100,
    ieps_tasa: (Number(v.ieps_tasa) || 0) / 100,
    retencion_iva_tasa: (Number(v.retencion_iva_tasa) || 0) / 100,
    retencion_isr_tasa: (Number(v.retencion_isr_tasa) || 0) / 100,
    iva_exento: v.iva_exento,
    activo: v.activo,
  }),
  rowLabel: (e) => e.nombre,
};

export default function Page() {
  return <CrudPage<EsquemaImpuesto> config={config} />;
}
