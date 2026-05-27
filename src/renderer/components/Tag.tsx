export function Tag({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-block rounded border border-border bg-bg-card px-2.5 py-0.5 text-xs text-text-primary"
    >
      {children}
    </span>
  );
}
