export function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        Esta sección estará disponible próximamente.
      </p>
    </div>
  );
}
