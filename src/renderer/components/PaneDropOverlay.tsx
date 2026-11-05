import type { MessageKey } from "../i18n/messages/en";
import { useLocale } from "../i18n/LocaleProvider";
import type { PaneDropZone } from "../terminal/pane-drop-zone";

const ZONE_KEYS: Record<PaneDropZone, MessageKey> = {
  above: "pane.dropAbove",
  below: "pane.dropBelow",
  left: "pane.dropLeft",
  right: "pane.dropRight",
  swap: "pane.dropSwap",
};

function zoneClass(active: boolean) {
  return `pane-drop-zone shrink-0 ${active ? "pane-drop-zone-active" : ""}`;
}

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
      <div className={`h-[22%] ${zoneClass(zone === "above")}`} />
      <div className="flex min-h-0 flex-1">
        <div className={`w-[22%] ${zoneClass(zone === "left")}`} />
        <div
          className={`pane-drop-zone relative flex min-w-0 flex-1 items-center justify-center ${
            zone === "swap" ? "pane-drop-swap-active" : ""
          }`}
        >
          <span className="warm-rise flex max-w-[90%] flex-col items-center gap-0.5 rounded-md bg-chrome-bg/90 px-2 py-1 text-center text-[10px] font-medium text-chrome-accent-text shadow-pop">
            {targetLabel ? (
              <span className="truncate text-[9px] font-normal text-chrome-text-muted">
                {targetLabel}
              </span>
            ) : null}
            <span>{t(ZONE_KEYS[zone])}</span>
          </span>
        </div>
        <div className={`w-[22%] ${zoneClass(zone === "right")}`} />
      </div>
      <div className={`h-[22%] ${zoneClass(zone === "below")}`} />
    </div>
  );
}
