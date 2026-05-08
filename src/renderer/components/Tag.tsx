export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-border bg-bg-card px-2.5 py-0.5 text-xs text-text-primary">
      {children}
    </span>
  );
}
