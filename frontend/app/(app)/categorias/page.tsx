"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { Categoria } from "@/lib/types";

const config: CrudConfig<Categoria> = {
  title: "Categorías",
  subtitle: "Categorías de productos",
  newLabel: "Nueva categoría",
  basePath: "/api/v1/categorias",
  writePerm: "categoria:gestionar",
  searchable: false,
  columns: [
    { header: "Código", cell: (c) => <span className="font-medium">{c.codigo}</span> },
    { header: "Nombre", cell: (c) => c.nombre },
    { header: "Estado", cell: (c) => <Badge tone={c.activo ? "success" : "muted"}>{c.activo ? "Activo" : "Inactivo"}</Badge> },
  ],
  fields: [
    { name: "nombre", label: "Nombre", required: true },
    { name: "codigo", label: "Código", required: true },
    { name: "descripcion", label: "Descripción", type: "textarea", colSpan: 2 },
    { name: "activo", label: "Activo", type: "switch" },
  ],
  newValues: () => ({ codigo: "", nombre: "", descripcion: "", activo: true }),
  toForm: (c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    descripcion: c.descripcion ?? "",
    activo: c.activo,
  }),
  toPayload: (v) => ({
    codigo: v.codigo,
    nombre: v.nombre,
    descripcion: (v.descripcion as string) || null,
    activo: v.activo,
  }),
  rowLabel: (c) => c.nombre,
};

export default function Page() {
  return <CrudPage<Categoria> config={config} />;
}
