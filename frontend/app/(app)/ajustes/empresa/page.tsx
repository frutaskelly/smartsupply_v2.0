"use client";

import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Pencil, ShieldCheck, Upload } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { KeyboardCombobox, type ComboOption } from "@/components/KeyboardCombobox";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";

const WRITE = "membership:gestionar";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8011";

// Catálogo de entidades federativas (clave de 3 letras del SAT c_Estado).
const MX_ESTADOS: ComboOption[] = [
  ["AGU", "Aguascalientes"], ["BCN", "Baja California"], ["BCS", "Baja California Sur"],
  ["CAM", "Campeche"], ["CHP", "Chiapas"], ["CHH", "Chihuahua"], ["COA", "Coahuila"],
  ["COL", "Colima"], ["CMX", "Ciudad de México"], ["DUR", "Durango"], ["MEX", "Estado de México"],
  ["GUA", "Guanajuato"], ["GRO", "Guerrero"], ["HID", "Hidalgo"], ["JAL", "Jalisco"],
  ["MIC", "Michoacán"], ["MOR", "Morelos"], ["NAY", "Nayarit"], ["NLE", "Nuevo León"],
  ["OAX", "Oaxaca"], ["PUE", "Puebla"], ["QUE", "Querétaro"], ["ROO", "Quintana Roo"],
  ["SLP", "San Luis Potosí"], ["SIN", "Sinaloa"], ["SON", "Sonora"], ["TAB", "Tabasco"],
  ["TAM", "Tamaulipas"], ["TLA", "Tlaxcala"], ["VER", "Veracruz"], ["YUC", "Yucatán"],
  ["ZAC", "Zacatecas"],
].map(([value, label]) => ({ value, label }));

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

type Empresa = {
  legal_name: string;
  rfc: string;
  regimen_fiscal_sat: string;
  domicilio_fiscal_cp: string;
  domicilio_fiscal: Record<string, unknown>;
};

type Csd = {
  Rfc?: string;
  rfc?: string;
  CsdCerExpirationDate?: string;
  ExpirationDate?: string;
  SerialNumber?: string;
  Serial?: string;
  [k: string]: unknown;
};

type FormState = {
  legal_name: string;
  rfc: string;
  regimen_fiscal_sat: string;
  domicilio_fiscal_cp: string;
  calle: string;
  colonia: string;
  ciudad: string;
  estado: string;
  pais: string;
};

const emptyForm = (): FormState => ({
  legal_name: "",
  rfc: "",
  regimen_fiscal_sat: "",
  domicilio_fiscal_cp: "",
  calle: "",
  colonia: "",
  ciudad: "",
  estado: "",
  pais: "",
});

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// Acepta una clave SAT ("JAL") o un nombre ("Jalisco") y devuelve la clave.
function normalizaEstado(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (MX_ESTADOS.some((o) => o.value === s)) return s;
  const byLabel = MX_ESTADOS.find((o) => o.label.toLowerCase() === s.toLowerCase());
  return byLabel ? byLabel.value : s;
}

export default function EmpresaPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  // Modo bloqueado: tras guardar, los campos quedan de solo lectura hasta
  // confirmar la edición (evita cambios accidentales en datos fiscales).
  const [locked, setLocked] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  // Recarga el checklist de onboarding tras guardar datos o subir CSD.
  const [onboardingKey, setOnboardingKey] = useState(0);

  const [csds, setCsds] = useState<Csd[]>([]);
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [csdPassword, setCsdPassword] = useState("");
  const [uploading, setUploading] = useState(false);

  function loadCsds() {
    apiFetch<Csd[]>("/api/v1/empresa/csd")
      .then((list) => setCsds(Array.isArray(list) ? list : []))
      .catch(() => setCsds([]));
  }

  useEffect(() => {
    apiFetch<Empresa>("/api/v1/empresa")
      .then((e) => {
        const dom = (e.domicilio_fiscal ?? {}) as Record<string, unknown>;
        setForm({
          legal_name: e.legal_name || "",
          rfc: e.rfc || "",
          regimen_fiscal_sat: e.regimen_fiscal_sat || "",
          domicilio_fiscal_cp: e.domicilio_fiscal_cp || "",
          calle: str(dom.calle),
          colonia: str(dom.colonia),
          ciudad: str(dom.ciudad),
          estado: normalizaEstado(str(dom.estado)),
          pais: str(dom.pais),
        });
        // Si ya hay datos fiscales guardados, arranca bloqueado.
        if ((e.legal_name || "").trim() || (e.rfc || "").trim()) setLocked(true);
      })
      .catch(() => {
        /* sin datos previos: deja el formulario vacío (modo edición) */
      })
      .finally(() => setLoading(false));
    loadCsds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function verificarRfc() {
    const rfc = form.rfc.trim().toUpperCase();
    if (!rfc) {
      toast.error("Captura primero el RFC");
      return;
    }
    setVerifying(true);
    try {
      const r = await apiFetch<{ FormatoCorrecto: boolean; Activo: boolean; Localizado: boolean }>(
        `/api/v1/clientes/validar-rfc?rfc=${encodeURIComponent(rfc)}`,
      );
      const ok = r.FormatoCorrecto && r.Activo && r.Localizado;
      setVerified(ok);
      if (ok) {
        toast.success("RFC verificado: activo y localizado en el SAT");
      } else {
        toast.error(
          `RFC: formato ${r.FormatoCorrecto ? "ok" : "inválido"}, activo ${r.Activo ? "sí" : "no"}, localizado ${r.Localizado ? "sí" : "no"}`,
        );
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo verificar el RFC");
    } finally {
      setVerifying(false);
    }
  }

  async function guardar() {
    if (!form.legal_name.trim()) {
      toast.error("La razón social es obligatoria");
      return;
    }
    if (!form.rfc.trim()) {
      toast.error("El RFC es obligatorio");
      return;
    }
    if (!form.domicilio_fiscal_cp.trim()) {
      toast.error("El código postal es obligatorio");
      return;
    }
    const domicilio_fiscal: Record<string, string> = {};
    for (const k of ["calle", "colonia", "ciudad", "estado", "pais"] as const) {
      const val = form[k].trim();
      if (val) domicilio_fiscal[k] = val;
    }
    setSaving(true);
    try {
      await apiFetch<Empresa>("/api/v1/empresa", {
        method: "PUT",
        body: JSON.stringify({
          legal_name: form.legal_name.trim(),
          rfc: form.rfc.trim().toUpperCase(),
          regimen_fiscal_sat: form.regimen_fiscal_sat.trim(),
          domicilio_fiscal_cp: form.domicilio_fiscal_cp.trim(),
          domicilio_fiscal,
        }),
      });
      toast.success("Datos fiscales guardados");
      setLocked(true);
      setOnboardingKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function subirCsd() {
    if (!cerFile || !keyFile) {
      toast.error("Selecciona el archivo .cer y el .key");
      return;
    }
    if (!csdPassword) {
      toast.error("Indica la contraseña de la llave privada");
      return;
    }
    setUploading(true);
    try {
      // apiFetch fuerza Content-Type JSON, así que para multipart usamos un
      // fetch crudo con el mismo Bearer token que usa toda la app.
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("cer", cerFile);
      fd.append("key", keyFile);
      fd.append("password", csdPassword);
      const headers = new Headers();
      if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

      const res = await fetch(`${API_URL}/api/v1/empresa/csd`, {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          detail = (await res.json()).detail ?? detail;
        } catch {
          /* cuerpo no-JSON */
        }
        throw new ApiError(res.status, detail);
      }
      toast.success("CSD subido correctamente");
      setCerFile(null);
      setKeyFile(null);
      setCsdPassword("");
      loadCsds();
      setOnboardingKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir el CSD");
    } finally {
      setUploading(false);
    }
  }

  // Solo lectura mientras no se esté editando (loading, sin permiso o bloqueado).
  const ro = !canWrite || loading || locked;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Empresa"
        subtitle="Datos fiscales del emisor y sellos digitales (CSD)"
      />

      <OnboardingChecklist refreshKey={onboardingKey} />

      <Card title="Datos fiscales" subtitle="Información del emisor que aparece en los CFDIs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Razón social" required>
              <Input
                placeholder="Empresa SA de CV"
                value={form.legal_name}
                onChange={(e) => set({ legal_name: e.target.value })}
                disabled={ro}
              />
            </Field>
          </div>
          <Field label="RFC" required>
            <div className="flex items-center gap-2">
              <Input
                placeholder="XAXX010101000"
                value={form.rfc}
                onChange={(e) => {
                  set({ rfc: e.target.value.toUpperCase() });
                  setVerified(false); // cualquier cambio invalida la verificación previa
                }}
                disabled={ro}
              />
              {verified ? (
                <Badge tone="success">
                  <CheckCircle2 size={12} className="mr-1" /> Verificado
                </Badge>
              ) : (
                <Button
                  variant="secondary"
                  onClick={verificarRfc}
                  disabled={verifying || loading || locked}
                >
                  <ShieldCheck size={16} /> {verifying ? "Verificando…" : "Verificar RFC"}
                </Button>
              )}
            </div>
          </Field>
          <Field label="Régimen fiscal SAT">
            <Select
              value={form.regimen_fiscal_sat}
              onChange={(e) => set({ regimen_fiscal_sat: e.target.value })}
              disabled={ro}
            >
              <option value="">— Selecciona —</option>
              {REGIMEN_FISCAL_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Código postal" required>
            <Input
              placeholder="11000"
              value={form.domicilio_fiscal_cp}
              onChange={(e) => set({ domicilio_fiscal_cp: e.target.value })}
              disabled={ro}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Calle y número">
              <Input
                value={form.calle}
                onChange={(e) => set({ calle: e.target.value })}
                disabled={ro}
              />
            </Field>
          </div>
          <Field label="Colonia">
            <Input
              value={form.colonia}
              onChange={(e) => set({ colonia: e.target.value })}
              disabled={ro}
            />
          </Field>
          <Field label="Ciudad/Municipio">
            <Input
              value={form.ciudad}
              onChange={(e) => set({ ciudad: e.target.value })}
              disabled={ro}
            />
          </Field>
          <Field label="Estado">
            <KeyboardCombobox
              options={MX_ESTADOS}
              value={form.estado}
              onSelect={(v) => set({ estado: v })}
              disabled={ro}
              placeholder="Busca tu estado…"
              emptyText="Sin coincidencias"
            />
          </Field>
          <Field label="País">
            <Input
              value={form.pais}
              onChange={(e) => set({ pais: e.target.value })}
              disabled={ro}
            />
          </Field>
        </div>

        {canWrite && (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            {locked ? (
              <Button variant="secondary" onClick={() => setEditConfirmOpen(true)} disabled={loading}>
                <Pencil size={16} /> Editar
              </Button>
            ) : (
              <Button onClick={guardar} disabled={saving || loading}>
                <Building2 size={16} /> {saving ? "Guardando…" : "Guardar"}
              </Button>
            )}
            {locked && (
              <span className="text-xs text-muted">
                Datos bloqueados. Pulsa Editar para modificarlos.
              </span>
            )}
          </div>
        )}
      </Card>

      <Card title="Sellos digitales (CSD)" subtitle="Certificado de Sello Digital del SAT para timbrar">
        <div className="space-y-4">
          <Alert tone="warning">
            En modo sandbox se usan certificados de prueba; para timbrar con tu CSD
            real se requiere la cuenta de Facturama en producción.
          </Alert>

          <p className="text-sm text-muted">
            Sube tu .cer y .key del SAT y la contraseña de la llave privada.
            Necesario para timbrar con tu RFC.
          </p>

          {canWrite && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Certificado (.cer)">
                <Input
                  type="file"
                  accept=".cer"
                  onChange={(e) => setCerFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                />
              </Field>
              <Field label="Llave privada (.key)">
                <Input
                  type="file"
                  accept=".key"
                  onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                />
              </Field>
              <Field label="Contraseña de la llave privada">
                <Input
                  type="password"
                  value={csdPassword}
                  onChange={(e) => setCsdPassword(e.target.value)}
                  disabled={uploading}
                />
              </Field>
              <div className="flex items-end">
                <Button onClick={subirCsd} disabled={uploading}>
                  <Upload size={16} /> {uploading ? "Subiendo…" : "Subir CSD"}
                </Button>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium">CSD cargados</div>
            {csds.length === 0 ? (
              <p className="text-sm text-muted">No hay sellos digitales cargados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-1.5 pr-3 font-medium">RFC</th>
                    <th className="py-1.5 pr-3 font-medium">No. de serie</th>
                    <th className="py-1.5 font-medium">Vigencia</th>
                  </tr>
                </thead>
                <tbody>
                  {csds.map((c, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3">{c.Rfc ?? c.rfc ?? "—"}</td>
                      <td className="py-1.5 pr-3">{c.SerialNumber ?? c.Serial ?? "—"}</td>
                      <td className="py-1.5">
                        {c.CsdCerExpirationDate ?? c.ExpirationDate ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={editConfirmOpen}
        title="Editar datos fiscales"
        message="Estás a punto de modificar los datos fiscales del emisor. Estos datos aparecen en los CFDIs timbrados. ¿Deseas continuar?"
        confirmLabel="Sí, editar"
        confirmVariant="primary"
        onConfirm={() => {
          setLocked(false);
          setEditConfirmOpen(false);
        }}
        onClose={() => setEditConfirmOpen(false)}
      />
    </div>
  );
}
