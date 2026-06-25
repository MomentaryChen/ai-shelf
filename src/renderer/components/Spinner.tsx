import { Loader2Icon } from "lucide-react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
      <Loader2Icon className="mb-3 size-7 animate-spin text-accent" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
