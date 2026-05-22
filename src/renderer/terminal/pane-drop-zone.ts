export type PaneDropZone = "above" | "below" | "left" | "right" | "swap";

const EDGE = 0.22;

/** Pick drop zone from cursor position over a pane (edges = insert, center = swap). */
export function hitPaneDropZone(clientX: number, clientY: number, rect: DOMRect): PaneDropZone {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (y < EDGE) return "above";
  if (y > 1 - EDGE) return "below";
  if (x < EDGE) return "left";
  if (x > 1 - EDGE) return "right";
  return "swap";
}

/** Sidebar tab list: top half = above, bottom half = below. */
export function hitPaneDropZone1D(clientY: number, rect: DOMRect): "above" | "below" {
  const y = (clientY - rect.top) / rect.height;
  return y < 0.5 ? "above" : "below";
}

import { getStoredT } from "../i18n/stored-locale.js";
import type { MessageKey } from "../i18n/messages/en.js";

const PANE_DROP_ZONE_KEYS: Record<PaneDropZone, MessageKey> = {
  above: "pane.dropAbove",
  below: "pane.dropBelow",
  left: "pane.dropLeft",
  right: "pane.dropRight",
  swap: "pane.dropSwap",
};

export function paneDropZoneHint(zone: PaneDropZone): string {
  return getStoredT(PANE_DROP_ZONE_KEYS[zone]);
}
