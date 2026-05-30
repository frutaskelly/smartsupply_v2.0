"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import type { Cliente } from "@/lib/types";

const config: CrudConfig<Cliente> = {
  title: "Clientes",
  subtitle: "Clientes / CRM",
  basePath: "/api/v1/clientes",
  writePerm: "cliente:gestionar",
  searchable: true,
  columns: [
    { header: "Código", cell: (c) => c.codigo ?? "—" },
    { header: "Razón social", cell: (c) => <span className="font-medium">{c.legal_name}</span> },
    { header: "RFC", cell: (c) => c.rfc },
    { header: "Tipo", cell: (c) => c.tipo },
    { header: "Estado", cell: (c) => <Badge tone={c.status === "ACTIVO" ? "success" : "muted"}>{c.status}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código" },
    { name: "legal_name", label: "Razón social", required: true, colSpan: 2 },
    { name: "rfc", label: "RFC", required: true },
    { name: "regimen_fiscal", label: "Régimen fiscal SAT", placeholder: "601" },
    {
      name: "tipo",
      label: "Tipo",
      type: "select",
      options: [
        { value: "PRINCIPAL_GOV", label: "Principal (gobierno)" },
        { value: "SUB", label: "Subcontrato" },
        { value: "PRIVADO", label: "Privado" },
        { value: "OTRO", label: "Otro" },
      ],
    },
    { name: "lista_precios_id", label: "Lista de precios", type: "select" },
    { name: "condiciones_pago", label: "Condiciones de pago", placeholder: "30 días" },
    { name: "limite_credito", label: "Límite de crédito", type: "number", step: "0.01" },
    { name: "dias_credito", label: "Días de crédito", type: "number" },
    {
      name: "status",
      label: "Estado",
      type: "select",
      options: [
        { value: "ACTIVO", label: "Activo" },
        { value: "SUSPENDIDO", label: "Suspendido" },
        { value: "BAJA", label: "Baja" },
      ],
    },
  ],
  lookups: {
    lista_precios_id: {
      path: "/api/v1/listas-precios?limit=200",
      value: (r) => String(r.id),
      label: (r) => String(r.nombre),
    },
  },
  newValues: () => ({
    codigo: "",
    legal_name: "",
    rfc: "",
    regimen_fiscal: "",
    tipo: "PRIVADO",
    lista_precios_id: "",
    condiciones_pago: "",
    limite_credito: "0",
    dias_credito: "0",
    status: "ACTIVO",
  }),
  toForm: (c) => ({
    codigo: c.codigo ?? "",
    legal_name: c.legal_name,
    rfc: c.rfc,
    regimen_fiscal: c.regimen_fiscal ?? "",
    tipo: c.tipo,
    lista_precios_id: c.lista_precios_id ?? "",
    condiciones_pago: c.condiciones_pago ?? "",
    limite_credito: c.limite_credito,
    dias_credito: String(c.dias_credito),
    status: c.status,
  }),
  toPayload: (v) => ({
    codigo: (v.codigo as string) || null,
    legal_name: v.legal_name,
    rfc: v.rfc,
    regimen_fiscal: (v.regimen_fiscal as string) || null,
    tipo: v.tipo,
    lista_precios_id: (v.lista_precios_id as string) || null,
    condiciones_pago: (v.condiciones_pago as string) || null,
    limite_credito: Number(v.limite_credito) || 0,
    dias_credito: Number(v.dias_credito) || 0,
    status: v.status,
  }),
  rowLabel: (c) => c.legal_name,
};

export default function Page() {
  return <CrudPage<Cliente> config={config} />;
}
