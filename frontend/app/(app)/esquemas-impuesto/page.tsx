"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { EsquemaImpuesto } from "@/lib/types";

const config: CrudConfig<EsquemaImpuesto> = {
  title: "Esquemas de impuesto",
  subtitle: "Tasas de IVA / IEPS y retenciones",
  newLabel: "Nuevo esquema de impuesto",
  basePath: "/api/v1/esquemas-impuesto",
  writePerm: "esquema_impuesto:gestionar",
  columns: [
    { header: "Código", cell: (e) => <span className="font-medium">{e.codigo}</span> },
    { header: "Nombre", cell: (e) => e.nombre },
    { header: "IVA", cell: (e) => `${Math.round(Number(e.iva_tasa) * 100)}%`, className: "text-right" },
    { header: "IEPS", cell: (e) => `${Math.round(Number(e.ieps_tasa) * 100)}%`, className: "text-right" },
    { header: "Exento", cell: (e) => (e.iva_exento ? "Sí" : "No") },
    { header: "Estado", cell: (e) => <Badge tone={e.activo ? "success" : "muted"}>{e.activo ? "Activo" : "Inactivo"}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código", readonly: true, hint: "Se genera automáticamente" },
    { name: "nombre", label: "Nombre", required: true },
    { name: "descripcion", label: "Descripción", type: "textarea", colSpan: 2 },
    { name: "iva_tasa", label: "Tasa IVA (%)", type: "number", step: "1", hint: "Porcentaje entero: 16 = 16%" },
    { name: "ieps_tasa", label: "Tasa IEPS (%)", type: "number", step: "1", hint: "Porcentaje entero: 8 = 8%" },
    { name: "retencion_iva_tasa", label: "Retención IVA (%)", type: "number", step: "1" },
    { name: "retencion_isr_tasa", label: "Retención ISR (%)", type: "number", step: "1" },
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
    // El backend guarda fracción (0.16); el form usa % entero (16).
    iva_tasa: String(Math.round(Number(e.iva_tasa) * 100)),
    ieps_tasa: String(Math.round(Number(e.ieps_tasa) * 100)),
    retencion_iva_tasa: String(Math.round(Number(e.retencion_iva_tasa) * 100)),
    retencion_isr_tasa: String(Math.round(Number(e.retencion_isr_tasa) * 100)),
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
