"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { Almacen } from "@/lib/types";

const config: CrudConfig<Almacen> = {
  title: "Almacenes",
  subtitle: "Almacenes / puntos de stock",
  basePath: "/api/v1/almacenes",
  writePerm: "almacen:gestionar",
  searchable: true,
  columns: [
    { header: "Código", cell: (a) => <span className="font-medium">{a.codigo}</span> },
    { header: "Nombre", cell: (a) => a.nombre },
    {
      header: "Domicilio",
      cell: (a) =>
        [a.calle, a.colonia, a.ciudad, a.estado].filter(Boolean).join(", ") || "—",
    },
    { header: "C.P.", cell: (a) => a.cp ?? "—" },
    { header: "Predeterminado", cell: (a) => (a.es_default ? <Badge tone="accent">Sí</Badge> : "—") },
  ],
  fields: [
    { name: "codigo", label: "Código", required: true },
    { name: "nombre", label: "Nombre", required: true },
    { name: "calle", label: "Calle y número", colSpan: 2 },
    { name: "colonia", label: "Colonia" },
    { name: "cp", label: "C.P. (Lugar de expedición CFDI)" },
    { name: "ciudad", label: "Ciudad / Municipio" },
    { name: "estado", label: "Estado" },
    { name: "es_default", label: "Almacén predeterminado", type: "switch" },
  ],
  newValues: () => ({ codigo: "", nombre: "", calle: "", colonia: "", cp: "", ciudad: "", estado: "", es_default: false }),
  toForm: (a) => ({
    codigo: a.codigo,
    nombre: a.nombre,
    calle: a.calle ?? "",
    colonia: a.colonia ?? "",
    cp: a.cp ?? "",
    ciudad: a.ciudad ?? "",
    estado: a.estado ?? "",
    es_default: a.es_default,
  }),
  toPayload: (v) => ({
    codigo: v.codigo,
    nombre: v.nombre,
    calle: (v.calle as string) || null,
    colonia: (v.colonia as string) || null,
    cp: (v.cp as string) || null,
    ciudad: (v.ciudad as string) || null,
    estado: (v.estado as string) || null,
    es_default: v.es_default,
  }),
  rowLabel: (a) => a.nombre,
};

export default function Page() {
  return <CrudPage<Almacen> config={config} />;
}
