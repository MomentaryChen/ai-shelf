export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
      <div className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-border/50 border-t-accent" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
