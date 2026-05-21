import { AppVersionBadge } from "./AppVersionBadge";

/** App title with version badge inline (主名稱旁). */
export function AppBrand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`.trim()}>
      <span className="text-[12px] font-semibold tracking-tight text-text-primary">AI Shelf</span>
      <AppVersionBadge />
    </div>
  );
}
