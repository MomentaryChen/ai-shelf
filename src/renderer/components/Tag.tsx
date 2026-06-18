export function Tag({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-block rounded-md border border-border-subtle bg-bg-card px-2 py-0.5 text-xs text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary"
    >
      {children}
    </span>
  );
}
