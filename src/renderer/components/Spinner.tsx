export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-3 border-border border-t-accent" />
      <p>{label}</p>
    </div>
  );
}
