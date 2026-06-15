"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";

// Regímenes fiscales SAT (c_RegimenFiscal). Se puede afinar luego en Ajustes › Empresa.
const REGIMEN_FISCAL_OPTS: { value: string; label: string }[] = [
  { value: "601", label: "601 — General de Ley Personas Morales" },
  { value: "603", label: "603 — Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 — Sueldos y Salarios" },
  { value: "606", label: "606 — Arrendamiento" },
  { value: "607", label: "607 — Enajenación o Adquisición de Bienes" },
  { value: "608", label: "608 — Demás ingresos" },
  { value: "610", label: "610 — Residentes en el Extranjero" },
  { value: "611", label: "611 — Ingresos por Dividendos" },
  { value: "612", label: "612 — Personas Físicas con Actividades Empresariales y Profesionales" },
  { value: "614", label: "614 — Ingresos por intereses" },
  { value: "615", label: "615 — Ingresos por obtención de premios" },
  { value: "616", label: "616 — Sin obligaciones fiscales" },
  { value: "620", label: "620 — Sociedades Cooperativas de Producción" },
  { value: "621", label: "621 — Incorporación Fiscal" },
  { value: "622", label: "622 — Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { value: "623", label: "623 — Opcional para Grupos de Sociedades" },
  { value: "624", label: "624 — Coordinados" },
  { value: "625", label: "625 — Actividades con ingresos vía Plataformas Tecnológicas" },
  { value: "626", label: "626 — Régimen Simplificado de Confianza (RESICO)" },
];

export default function SignupPage() {
  const router = useRouter();
  const { session } = useAuth();

  const [legalName, setLegalName] = useState("");
  const [rfc, setRfc] = useState("");
  const [regimen, setRegimen] = useState("");
  const [cp, setCp] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!regimen) {
      setError("Selecciona el régimen fiscal de tu empresa");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setBusy(true);
    try {
      await apiFetch("/api/v1/registro", {
        method: "POST",
        body: JSON.stringify({
          legal_name: legalName.trim(),
          rfc: rfc.trim().toUpperCase(),
          regimen_fiscal_sat: regimen,
          domicilio_fiscal_cp: cp.trim(),
          owner_email: email.trim().toLowerCase(),
          owner_name: ownerName.trim() || null,
          password,
        }),
      });

      // Alta correcta → iniciar sesión y mandar al onboarding fiscal.
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        // La cuenta se creó pero el auto-login falló: manda a login manual.
        router.replace("/login");
        return;
      }
      router.replace("/onboarding");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar el registro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-muted">
          Registra tu empresa para empezar a facturar
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Tu empresa
          </div>
          <Field label="Razón social" required>
            <Input
              placeholder="Empresa SA de CV"
              required
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RFC" required>
              <Input
                placeholder="XAXX010101000"
                required
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Código postal" required>
              <Input
                placeholder="11000"
                inputMode="numeric"
                required
                value={cp}
                onChange={(e) => setCp(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Régimen fiscal SAT" required>
            <Select value={regimen} onChange={(e) => setRegimen(e.target.value)} required>
              <option value="">— Selecciona —</option>
              {REGIMEN_FISCAL_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Tu cuenta
          </div>
          <Field label="Tu nombre">
            <Input
              autoComplete="name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </Field>
          <Field label="Correo" required>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Contraseña" required>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
