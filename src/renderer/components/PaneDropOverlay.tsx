import type { MessageKey } from "../i18n/messages/en";
import { useLocale } from "../i18n/LocaleProvider";
import type { PaneDropZone } from "../terminal/pane-drop-zone";

const ACTIVE = "bg-[#7eb6ff]/28 ring-1 ring-inset ring-[#7eb6ff]/45";

const ZONE_KEYS: Record<PaneDropZone, MessageKey> = {
  above: "pane.dropAbove",
  below: "pane.dropBelow",
  left: "pane.dropLeft",
  right: "pane.dropRight",
  swap: "pane.dropSwap",
};

export function PaneDropOverlay({ zone }: { zone: PaneDropZone }) {
  const { t } = useLocale();
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
      <div className={`h-[22%] shrink-0 transition-colors ${zone === "above" ? ACTIVE : ""}`} />
      <div className="flex min-h-0 flex-1">
        <div className={`w-[22%] shrink-0 transition-colors ${zone === "left" ? ACTIVE : ""}`} />
        <div
          className={`relative flex min-w-0 flex-1 items-center justify-center transition-colors ${
            zone === "swap" ? "bg-[#7eb6ff]/18 ring-2 ring-inset ring-[#7eb6ff]/55" : ""
          }`}
        >
          <span className="rounded-md bg-[#0c0c0e]/90 px-2 py-1 text-[10px] font-medium text-[#c8daf4] shadow-lg">
            {t(ZONE_KEYS[zone])}
          </span>
        </div>
        <div className={`w-[22%] shrink-0 transition-colors ${zone === "right" ? ACTIVE : ""}`} />
      </div>
      <div className={`h-[22%] shrink-0 transition-colors ${zone === "below" ? ACTIVE : ""}`} />
    </div>
  );
}
