"use client";

import { CrudPage, type CrudConfig } from "@/components/crud/CrudPage";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import type { Cliente } from "@/lib/types";

const REGIMEN_FISCAL_OPTS: { value: string; label: string }[] = [
  { value: "601", label: "601 — General de Ley Personas Morales" },
  { value: "603", label: "603 — Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 — Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { value: "606", label: "606 — Arrendamiento" },
  { value: "607", label: "607 — Régimen de Enajenación o Adquisición de Bienes" },
  { value: "608", label: "608 — Demás ingresos" },
  { value: "610", label: "610 — Residentes en el Extranjero sin Establecimiento Permanente en México" },
  { value: "611", label: "611 — Ingresos por Dividendos" },
  { value: "612", label: "612 — Personas Físicas con Actividades Empresariales y Profesionales" },
  { value: "614", label: "614 — Ingresos por intereses" },
  { value: "615", label: "615 — Régimen de los ingresos por obtención de premios" },
  { value: "616", label: "616 — Sin obligaciones fiscales" },
  { value: "620", label: "620 — Sociedades Cooperativas de Producción que optan por diferir ingresos" },
  { value: "621", label: "621 — Incorporación Fiscal" },
  { value: "622", label: "622 — Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { value: "623", label: "623 — Opcional para Grupos de Sociedades" },
  { value: "624", label: "624 — Coordinados" },
  { value: "625", label: "625 — Régimen de Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { value: "626", label: "626 — Régimen Simplificado de Confianza (RESICO)" },
  { value: "628", label: "628 — Hidrocarburos" },
  { value: "629", label: "629 — Regímenes Fiscales Preferentes y Empresas Multinacionales" },
  { value: "630", label: "630 — Enajenación de acciones en bolsa de valores" },
];

const config: CrudConfig<Cliente> = {
  title: "Clientes",
  subtitle: "Clientes / CRM",
  newLabel: "Nuevo cliente",
  basePath: "/api/v1/clientes",
  writePerm: "cliente:gestionar",
  searchable: false,
  columns: [
    { header: "Código", cell: (c) => c.codigo ?? "—" },
    { header: "Razón social", cell: (c) => <span className="font-medium">{c.legal_name}</span> },
    { header: "RFC", cell: (c) => c.rfc },
    { header: "Tipo", cell: (c) => c.tipo },
    { header: "Estado", cell: (c) => <Badge tone={c.status === "ACTIVO" ? "success" : "muted"}>{c.status}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código", readonly: true, hint: "Se genera automáticamente" },
    { name: "legal_name", label: "Razón social", required: true, colSpan: 2 },
    {
      name: "rfc",
      label: "RFC",
      required: true,
      action: {
        label: "Verificar RFC",
        run: async (rfc) => {
          const r = await apiFetch<{ FormatoCorrecto: boolean; Activo: boolean; Localizado: boolean }>(
            `/api/v1/clientes/validar-rfc?rfc=${encodeURIComponent(rfc)}`,
          );
          return r.Activo && r.Localizado
            ? "RFC válido: activo y localizado en el SAT ✓"
            : `RFC: formato ${r.FormatoCorrecto ? "ok" : "inválido"}, activo ${r.Activo ? "sí" : "no"}, localizado ${r.Localizado ? "sí" : "no"}`;
        },
      },
    },
    {
      name: "regimen_fiscal",
      label: "Régimen fiscal SAT",
      type: "select",
      required: true,
      options: REGIMEN_FISCAL_OPTS,
    },
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
    { name: "calle", label: "Calle y número", colSpan: 2 },
    { name: "colonia", label: "Colonia" },
    { name: "ciudad", label: "Ciudad/Municipio" },
    { name: "estado", label: "Estado" },
    { name: "cp", label: "Código postal", required: true },
    { name: "pais", label: "País" },
    { name: "telefono", label: "Teléfono" },
    { name: "email", label: "Email" },
    { name: "lista_precios_id", label: "Lista de precios", type: "select" },
    { name: "limite_credito", label: "Límite de crédito", type: "number", step: "0.01" },
    { name: "dias_credito", label: "Condiciones de pago (días)", type: "number" },
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
    {
      name: "serie_factura_id",
      label: "Serie de factura",
      type: "select",
      hint: "La sucursal puede sobreescribirla; en blanco usa la predeterminada",
    },
    {
      name: "serie_remision_id",
      label: "Serie de remisión",
      type: "select",
      hint: "La sucursal puede sobreescribirla; en blanco usa la predeterminada",
    },
  ],
  lookups: {
    lista_precios_id: {
      path: "/api/v1/listas-precios?limit=200",
      value: (r) => String(r.id),
      label: (r) => String(r.nombre),
    },
    serie_factura_id: {
      path: "/api/v1/series?tipo_documento=FACTURA&activa=true&limit=200",
      value: (r) => String(r.id),
      label: (r) => `${r.codigo}${r.nombre ? ` · ${r.nombre}` : ""}`,
    },
    serie_remision_id: {
      path: "/api/v1/series?tipo_documento=REMISION&activa=true&limit=200",
      value: (r) => String(r.id),
      label: (r) => `${r.codigo}${r.nombre ? ` · ${r.nombre}` : ""}`,
    },
  },
  newValues: () => ({
    codigo: "",
    legal_name: "",
    rfc: "",
    regimen_fiscal: "",
    tipo: "PRIVADO",
    calle: "",
    colonia: "",
    ciudad: "",
    estado: "",
    cp: "",
    pais: "México",
    telefono: "",
    email: "",
    lista_precios_id: "",
    limite_credito: "0",
    dias_credito: "0",
    status: "ACTIVO",
    serie_factura_id: "",
    serie_remision_id: "",
  }),
  toForm: (c) => {
    const dom = (c.domicilio_fiscal ?? {}) as Record<string, unknown>;
    return {
      codigo: c.codigo ?? "",
      legal_name: c.legal_name,
      rfc: c.rfc,
      regimen_fiscal: c.regimen_fiscal ?? "",
      tipo: c.tipo,
      calle: (dom.calle as string) ?? "",
      colonia: (dom.colonia as string) ?? "",
      ciudad: (dom.ciudad as string) ?? "",
      estado: (dom.estado as string) ?? "",
      cp: (dom.cp as string) ?? "",
      pais: (dom.pais as string) ?? "México",
      telefono: (dom.telefono as string) ?? "",
      email: (dom.email as string) ?? "",
      lista_precios_id: c.lista_precios_id ?? "",
      limite_credito: c.limite_credito,
      dias_credito: String(c.dias_credito),
      status: c.status,
      serie_factura_id: c.serie_factura_id ?? "",
      serie_remision_id: c.serie_remision_id ?? "",
    };
  },
  toPayload: (v) => {
    const domicilio_fiscal: Record<string, string> = {};
    for (const k of ["cp", "calle", "colonia", "ciudad", "estado", "pais", "telefono", "email"] as const) {
      const val = (v[k] as string)?.trim?.();
      if (val) domicilio_fiscal[k] = val;
    }
    return {
      // codigo lo genera el servidor; no se envía.
      legal_name: v.legal_name,
      rfc: v.rfc,
      regimen_fiscal: (v.regimen_fiscal as string) || null,
      tipo: v.tipo,
      domicilio_fiscal,
      lista_precios_id: (v.lista_precios_id as string) || null,
      limite_credito: Number(v.limite_credito) || 0,
      dias_credito: Number(v.dias_credito) || 0,
      status: v.status,
      serie_factura_id: (v.serie_factura_id as string) || null,
      serie_remision_id: (v.serie_remision_id as string) || null,
    };
  },
  rowLabel: (c) => c.legal_name,
};

export default function Page() {
  return <CrudPage<Cliente> config={config} />;
}
