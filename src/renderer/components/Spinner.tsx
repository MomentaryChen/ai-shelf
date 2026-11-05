import { WarmTypingDots } from "./WarmTypingDots";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-secondary">
      <WarmTypingDots tone="warm" size="lg" label={label} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
