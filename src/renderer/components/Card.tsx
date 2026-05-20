export function Card({
  title,
  trailing,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 rounded-lg border border-border bg-bg-secondary p-5 ${className}`.trim()}>
      {(title || trailing) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <div className="flex items-center gap-2 text-base font-semibold">{title}</div>}
          {trailing}
        </div>
      )}
      {children}
    </div>
  );
}
