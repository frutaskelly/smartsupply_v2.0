export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">SmartSupply v2.0</h1>
      <p className="text-[var(--text-secondary)]">
        Plataforma SaaS multi-tenant — cimientos listos.
      </p>
      <p className="text-sm text-[var(--text-secondary)]">
        API: <code>/health</code> · Auth: Supabase (JWKS ES256)
      </p>
    </main>
  );
}
