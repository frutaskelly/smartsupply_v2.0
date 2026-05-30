"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { Categoria } from "@/lib/types";

const config: CrudConfig<Categoria> = {
  title: "Categorías",
  subtitle: "Categorías de productos",
  basePath: "/api/v1/categorias",
  writePerm: "categoria:gestionar",
  searchable: true,
  columns: [
    { header: "Código", cell: (c) => <span className="font-medium">{c.codigo}</span> },
    { header: "Nombre", cell: (c) => c.nombre },
    { header: "Orden", cell: (c) => String(c.orden), className: "text-right" },
    { header: "Estado", cell: (c) => <Badge tone={c.activo ? "success" : "muted"}>{c.activo ? "Activo" : "Inactivo"}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código", required: true },
    { name: "nombre", label: "Nombre", required: true },
    { name: "descripcion", label: "Descripción", type: "textarea", colSpan: 2 },
    { name: "color", label: "Color", placeholder: "#3b82f6" },
    { name: "orden", label: "Orden", type: "number" },
    { name: "activo", label: "Activo", type: "switch" },
  ],
  newValues: () => ({ codigo: "", nombre: "", descripcion: "", color: "", orden: "0", activo: true }),
  toForm: (c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    descripcion: c.descripcion ?? "",
    color: c.color ?? "",
    orden: String(c.orden),
    activo: c.activo,
  }),
  toPayload: (v) => ({
    codigo: v.codigo,
    nombre: v.nombre,
    descripcion: (v.descripcion as string) || null,
    color: (v.color as string) || null,
    orden: Number(v.orden) || 0,
    activo: v.activo,
  }),
  rowLabel: (c) => c.nombre,
};

export default function Page() {
  return <CrudPage<Categoria> config={config} />;
}
