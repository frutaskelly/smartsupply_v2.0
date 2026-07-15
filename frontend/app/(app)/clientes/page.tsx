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

// Catálogo SAT c_UsoCFDI (CFDI 4.0).
const USO_CFDI_OPTS: { value: string; label: string }[] = [
  { value: "G01", label: "G01 — Adquisición de mercancías" },
  { value: "G02", label: "G02 — Devoluciones, descuentos o bonificaciones" },
  { value: "G03", label: "G03 — Gastos en general" },
  { value: "I01", label: "I01 — Construcciones" },
  { value: "I02", label: "I02 — Mobiliario y equipo de oficina por inversiones" },
  { value: "I03", label: "I03 — Equipo de transporte" },
  { value: "I04", label: "I04 — Equipo de cómputo y accesorios" },
  { value: "I05", label: "I05 — Dados, troqueles, moldes, matrices y otros activos" },
  { value: "I06", label: "I06 — Comunicaciones telefónicas" },
  { value: "I07", label: "I07 — Comunicaciones satelitales" },
  { value: "I08", label: "I08 — Otra maquinaria y equipo" },
  { value: "D01", label: "D01 — Honorarios médicos, dentales y gastos hospitalarios" },
  { value: "D02", label: "D02 — Gastos médicos por incapacidad o discapacidad" },
  { value: "D03", label: "D03 — Gastos funerales" },
  { value: "D04", label: "D04 — Donativos" },
  { value: "D05", label: "D05 — Intereses por créditos hipotecarios (casa habitación)" },
  { value: "D06", label: "D06 — Aportaciones voluntarias al SAR" },
  { value: "D07", label: "D07 — Primas por seguros de gastos médicos" },
  { value: "D08", label: "D08 — Gastos de transportación escolar obligatoria" },
  { value: "D09", label: "D09 — Depósitos en cuentas para el ahorro, pensiones" },
  { value: "D10", label: "D10 — Pagos por servicios educativos (colegiaturas)" },
  { value: "S01", label: "S01 — Sin efectos fiscales" },
  { value: "CP01", label: "CP01 — Pagos" },
  { value: "CN01", label: "CN01 — Nómina" },
];

// Catálogo SAT c_FormaPago (CFDI 4.0).
const FORMA_PAGO_OPTS: { value: string; label: string }[] = [
  { value: "01", label: "01 — Efectivo" },
  { value: "02", label: "02 — Cheque nominativo" },
  { value: "03", label: "03 — Transferencia electrónica de fondos" },
  { value: "04", label: "04 — Tarjeta de crédito" },
  { value: "05", label: "05 — Monedero electrónico" },
  { value: "06", label: "06 — Dinero electrónico" },
  { value: "08", label: "08 — Vales de despensa" },
  { value: "12", label: "12 — Dación en pago" },
  { value: "13", label: "13 — Pago por subrogación" },
  { value: "14", label: "14 — Pago por consignación" },
  { value: "15", label: "15 — Condonación" },
  { value: "17", label: "17 — Compensación" },
  { value: "23", label: "23 — Novación" },
  { value: "24", label: "24 — Confusión" },
  { value: "25", label: "25 — Remisión de deuda" },
  { value: "26", label: "26 — Prescripción o caducidad" },
  { value: "27", label: "27 — A satisfacción del acreedor" },
  { value: "28", label: "28 — Tarjeta de débito" },
  { value: "29", label: "29 — Tarjeta de servicios" },
  { value: "30", label: "30 — Aplicación de anticipos" },
  { value: "31", label: "31 — Intermediario pagos" },
  { value: "99", label: "99 — Por definir" },
];

// Catálogo SAT c_MetodoPago (CFDI 4.0).
const METODO_PAGO_OPTS: { value: string; label: string }[] = [
  { value: "PUE", label: "PUE — Pago en una sola exhibición" },
  { value: "PPD", label: "PPD — Pago en parcialidades o diferido" },
];

const config: CrudConfig<Cliente> = {
  title: "Clientes",
  subtitle: "Clientes / CRM",
  newLabel: "Nuevo cliente",
  basePath: "/api/v1/clientes",
  writePerm: "cliente:gestionar",
  searchable: false,
  wide: true,
  columns: [
    { header: "Código", cell: (c) => c.codigo ?? "—" },
    { header: "Razón social", cell: (c) => <span className="font-medium">{c.legal_name}</span> },
    { header: "RFC", cell: (c) => c.rfc },
    { header: "Estado", cell: (c) => <Badge tone={c.status === "ACTIVO" ? "success" : "muted"}>{c.status}</Badge> },
  ],
  fields: [
    { name: "codigo", label: "Código", readonly: true, hint: "Se genera automáticamente" },
    { name: "legal_name", label: "Razón social", required: true, colSpan: 2 },
    {
      name: "rfc",
      label: "RFC",
      required: true,
      colSpan: 2,
      action: {
        label: "Verificar RFC",
        // Con Razón social + CP + Régimen ya capturados, valida el combo
        // completo contra el SAT (POST /customers/validate): atrapa un CP o
        // régimen mal capturado ANTES de que el timbrado real lo rechace.
        // Si falta alguno de esos tres, hace el chequeo parcial de siempre
        // (solo formato/activo/localizado del RFC) y avisa qué falta para
        // completarlo.
        watch: ["legal_name", "cp", "regimen_fiscal"],
        run: async (rfc, form) => {
          const nombre = String(form.legal_name ?? "").trim();
          const cp = String(form.cp ?? "").trim();
          const regimen = String(form.regimen_fiscal ?? "").trim();
          const completo = Boolean(nombre && cp && regimen);

          const qs = new URLSearchParams({ rfc });
          if (completo) {
            qs.set("nombre", nombre);
            qs.set("cp", cp);
            qs.set("regimen", regimen);
          }
          const r = await apiFetch<{
            FormatoCorrecto?: boolean;
            Activo?: boolean;
            Localizado?: boolean;
            ExistRfc?: boolean;
            MatchName?: boolean;
            MatchZipCode?: boolean;
            MatchFiscalRegime?: boolean;
          }>(`/api/v1/clientes/validar-rfc?${qs.toString()}`);

          if (completo) {
            const problemas = [
              r.ExistRfc === false && "el RFC no existe ante el SAT",
              r.MatchName === false && "la razón social no coincide",
              r.MatchZipCode === false && "el código postal no coincide",
              r.MatchFiscalRegime === false && "el régimen fiscal no coincide",
            ].filter((x): x is string => Boolean(x));
            return {
              ok: problemas.length === 0,
              message:
                problemas.length === 0
                  ? "RFC, razón social, CP y régimen coinciden con el SAT ✓"
                  : `No coincide con el SAT: ${problemas.join(", ")}.`,
            };
          }

          const ok = Boolean(r.FormatoCorrecto && r.Activo && r.Localizado);
          const faltan = [!nombre && "razón social", !cp && "código postal", !regimen && "régimen fiscal"]
            .filter((x): x is string => Boolean(x))
            .join(", ");
          return {
            ok,
            message: ok
              ? `RFC activo y localizado en el SAT ✓ — completa ${faltan} para validar también esos datos`
              : `RFC: formato ${r.FormatoCorrecto ? "ok" : "inválido"}, activo ${r.Activo ? "sí" : "no"}, localizado ${r.Localizado ? "sí" : "no"}`,
          };
        },
      },
    },
    { name: "cp", label: "Código postal", required: true },
    {
      name: "regimen_fiscal",
      label: "Régimen fiscal SAT",
      type: "select",
      required: true,
      options: REGIMEN_FISCAL_OPTS,
      colSpan: 2,
    },
    {
      name: "uso_cfdi_default",
      label: "Uso del CFDI",
      type: "select",
      required: true,
      options: USO_CFDI_OPTS,
      hint: "Predeterminado al generar facturas para este cliente",
      colSpan: 2,
    },
    {
      name: "forma_pago_default",
      label: "Forma de pago SAT",
      type: "select",
      required: true,
      options: FORMA_PAGO_OPTS,
      colSpan: 2,
    },
    {
      name: "metodo_pago_default",
      label: "Método de pago",
      type: "select",
      required: true,
      options: METODO_PAGO_OPTS,
      hint: "PUE exige una forma de pago real (no 99); PPD permite 99 — Por definir",
      colSpan: 2,
    },
    { name: "calle", label: "Calle y número", colSpan: 2 },
    { name: "colonia", label: "Colonia" },
    { name: "ciudad", label: "Ciudad/Municipio" },
    { name: "estado", label: "Estado" },
    { name: "pais", label: "País" },
    { name: "telefono", label: "Teléfono" },
    { name: "email", label: "Correos", hint: "Uno o varios, separados por coma o espacio; se usan al enviar remisiones y facturas", colSpan: 2 },
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
    uso_cfdi_default: "G01",
    forma_pago_default: "99",
    metodo_pago_default: "PPD",
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
      uso_cfdi_default: c.uso_cfdi_default ?? "G01",
      forma_pago_default: c.forma_pago_default ?? "99",
      metodo_pago_default: c.metodo_pago_default ?? "PPD",
      calle: (dom.calle as string) ?? "",
      colonia: (dom.colonia as string) ?? "",
      ciudad: (dom.ciudad as string) ?? "",
      estado: (dom.estado as string) ?? "",
      cp: (dom.cp as string) ?? "",
      pais: (dom.pais as string) ?? "México",
      telefono: (dom.telefono as string) ?? "",
      // Correos: array `correos` (varios) o el `email` legado (uno) → texto editable.
      email: Array.isArray(dom.correos)
        ? (dom.correos as string[]).join(", ")
        : (dom.email as string) ?? "",
      lista_precios_id: c.lista_precios_id ?? "",
      limite_credito: c.limite_credito,
      dias_credito: String(c.dias_credito),
      status: c.status,
      serie_factura_id: c.serie_factura_id ?? "",
      serie_remision_id: c.serie_remision_id ?? "",
    };
  },
  toPayload: (v) => {
    const domicilio_fiscal: Record<string, string | string[]> = {};
    for (const k of ["cp", "calle", "colonia", "ciudad", "estado", "pais", "telefono"] as const) {
      const val = (v[k] as string)?.trim?.();
      if (val) domicilio_fiscal[k] = val;
    }
    // Correos: uno o varios (coma/espacio) → array `correos`; `email` = primero
    // para compatibilidad con lecturas antiguas.
    const correos = ((v.email as string) || "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (correos.length) {
      domicilio_fiscal.correos = correos;
      domicilio_fiscal.email = correos[0];
    }
    return {
      // codigo lo genera el servidor; no se envía.
      legal_name: v.legal_name,
      rfc: v.rfc,
      regimen_fiscal: (v.regimen_fiscal as string) || null,
      uso_cfdi_default: (v.uso_cfdi_default as string) || null,
      forma_pago_default: (v.forma_pago_default as string) || null,
      metodo_pago_default: (v.metodo_pago_default as string) || null,
      // `tipo` no se captura en el formulario; el backend usa su default "PRIVADO".
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
