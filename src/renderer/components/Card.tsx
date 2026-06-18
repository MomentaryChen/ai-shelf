export function Card({
  title,
  trailing,
  children,
  hoverable = false,
  className = "",
}: {
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  /** Lift the border on hover — use for cards that act as a clickable target. */
  hoverable?: boolean;
  className?: string;
}) {
  const interactive = hoverable
    ? "transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-pop"
    : "";
  return (
    <div
      className={`mb-3 rounded-xl border border-border bg-bg-secondary p-5 shadow-card ${interactive} ${className}`.trim()}
    >
      {(title || trailing) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-text-primary">
              {title}
            </div>
          )}
          {trailing}
        </div>
      )}
      {children}
    </div>
  );
}
