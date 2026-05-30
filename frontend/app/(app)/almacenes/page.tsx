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
    { header: "Dirección", cell: (a) => a.direccion ?? "—" },
    { header: "Predeterminado", cell: (a) => (a.es_default ? <Badge tone="accent">Sí</Badge> : "—") },
  ],
  fields: [
    { name: "codigo", label: "Código", required: true },
    { name: "nombre", label: "Nombre", required: true },
    { name: "direccion", label: "Dirección", type: "textarea", colSpan: 2 },
    { name: "es_default", label: "Almacén predeterminado", type: "switch" },
  ],
  newValues: () => ({ codigo: "", nombre: "", direccion: "", es_default: false }),
  toForm: (a) => ({
    codigo: a.codigo,
    nombre: a.nombre,
    direccion: a.direccion ?? "",
    es_default: a.es_default,
  }),
  toPayload: (v) => ({
    codigo: v.codigo,
    nombre: v.nombre,
    direccion: (v.direccion as string) || null,
    es_default: v.es_default,
  }),
  rowLabel: (a) => a.nombre,
};

export default function Page() {
  return <CrudPage<Almacen> config={config} />;
}
