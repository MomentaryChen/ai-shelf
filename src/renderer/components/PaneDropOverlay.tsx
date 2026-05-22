import { PANE_DROP_ZONE_HINT, type PaneDropZone } from "../terminal/pane-drop-zone";

const ACTIVE = "bg-accent/28 ring-1 ring-inset ring-accent/45";

export function PaneDropOverlay({ zone }: { zone: PaneDropZone }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
      <div className={`h-[22%] shrink-0 transition-colors ${zone === "above" ? ACTIVE : ""}`} />
      <div className="flex min-h-0 flex-1">
        <div className={`w-[22%] shrink-0 transition-colors ${zone === "left" ? ACTIVE : ""}`} />
        <div
          className={`relative flex min-w-0 flex-1 items-center justify-center transition-colors ${
            zone === "swap" ? "bg-accent/18 ring-2 ring-inset ring-accent/55" : ""
          }`}
        >
          <span className="rounded-md bg-chrome-bg/90 px-2 py-1 text-[10px] font-medium text-chrome-accent-text shadow-lg">
            {PANE_DROP_ZONE_HINT[zone]}
          </span>
        </div>
        <div className={`w-[22%] shrink-0 transition-colors ${zone === "right" ? ACTIVE : ""}`} />
      </div>
      <div className={`h-[22%] shrink-0 transition-colors ${zone === "below" ? ACTIVE : ""}`} />
    </div>
  );
}
