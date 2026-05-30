"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { EsquemaImpuesto } from "@/lib/types";

const config: CrudConfig<EsquemaImpuesto> = {
  title: "Esquemas de impuesto",
  subtitle: "Tasas de IVA / IEPS y retenciones",
  basePath: "/api/v1/esquemas-impuesto",
  writePerm: "esquema_impuesto:gestionar",
  columns: [
    { header: "Código", cell: (e) => <span className="font-medium">{e.codigo}</span> },
    { header: "Nombre", cell: (e) => e.nombre },
    { header: "IVA", cell: (e) => `${(Number(e.iva_tasa) * 100).toFixed(2)}%`, className: "text-right" },
    { header: "Exento", cell: (e) => (e.iva_exento ? "Sí" : "No") },
    { header: "Estado", cell: (e) => <Badge tone={e.activo ? "success" : "muted"}>{e.activo ? "Activo" : "Inactivo"}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código", required: true },
    { name: "nombre", label: "Nombre", required: true },
    { name: "descripcion", label: "Descripción", type: "textarea", colSpan: 2 },
    { name: "iva_tasa", label: "Tasa IVA", type: "number", step: "0.0001", hint: "fracción: 0.16 = 16%" },
    { name: "ieps_tasa", label: "Tasa IEPS", type: "number", step: "0.0001" },
    { name: "retencion_iva_tasa", label: "Retención IVA", type: "number", step: "0.0001" },
    { name: "retencion_isr_tasa", label: "Retención ISR", type: "number", step: "0.0001" },
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
    iva_tasa: e.iva_tasa,
    ieps_tasa: e.ieps_tasa,
    retencion_iva_tasa: e.retencion_iva_tasa,
    retencion_isr_tasa: e.retencion_isr_tasa,
    iva_exento: e.iva_exento,
    activo: e.activo,
  }),
  toPayload: (v) => ({
    codigo: v.codigo,
    nombre: v.nombre,
    descripcion: (v.descripcion as string) || null,
    iva_tasa: Number(v.iva_tasa) || 0,
    ieps_tasa: Number(v.ieps_tasa) || 0,
    retencion_iva_tasa: Number(v.retencion_iva_tasa) || 0,
    retencion_isr_tasa: Number(v.retencion_isr_tasa) || 0,
    iva_exento: v.iva_exento,
    activo: v.activo,
  }),
  rowLabel: (e) => e.nombre,
};

export default function Page() {
  return <CrudPage<EsquemaImpuesto> config={config} />;
}
