import type { MessageKey } from "../i18n/messages/en";
import { useLocale } from "../i18n/LocaleProvider";
import type { PaneDropZone } from "../terminal/pane-drop-zone";

const ACTIVE = "bg-accent/28 ring-1 ring-inset ring-accent/45";

const ZONE_KEYS: Record<PaneDropZone, MessageKey> = {
  above: "pane.dropAbove",
  below: "pane.dropBelow",
  left: "pane.dropLeft",
  right: "pane.dropRight",
  swap: "pane.dropSwap",
};

export function PaneDropOverlay({
  zone,
  targetLabel,
}: {
  zone: PaneDropZone;
  /** Shown when dropping a sidebar tab onto this pane. */
  targetLabel?: string;
}) {
  const { t } = useLocale();
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col">
      <div className={`h-[22%] shrink-0 transition-colors ${zone === "above" ? ACTIVE : ""}`} />
      <div className="flex min-h-0 flex-1">
        <div className={`w-[22%] shrink-0 transition-colors ${zone === "left" ? ACTIVE : ""}`} />
        <div
          className={`relative flex min-w-0 flex-1 items-center justify-center transition-colors ${
            zone === "swap" ? "bg-accent/18 ring-2 ring-inset ring-accent/55" : ""
          }`}
        >
          <span className="flex max-w-[90%] flex-col items-center gap-0.5 rounded-md bg-chrome-bg/90 px-2 py-1 text-center text-[10px] font-medium text-chrome-accent-text shadow-lg">
            {targetLabel ? (
              <span className="truncate text-[9px] font-normal text-chrome-text-muted">
                {targetLabel}
              </span>
            ) : null}
            <span>{t(ZONE_KEYS[zone])}</span>
          </span>
        </div>
        <div className={`w-[22%] shrink-0 transition-colors ${zone === "right" ? ACTIVE : ""}`} />
      </div>
      <div className={`h-[22%] shrink-0 transition-colors ${zone === "below" ? ACTIVE : ""}`} />
    </div>
  );
}
