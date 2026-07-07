"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput } from "@/components/ui/Field";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">SmartSupply v2.0</h1>
        <p className="mt-1 text-sm text-muted">Inicia sesión para continuar</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Correo">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Contraseña">
            <PasswordInput
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  );
}
