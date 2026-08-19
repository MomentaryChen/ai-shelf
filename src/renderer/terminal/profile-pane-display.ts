import { collectPanes, findPane, type LayoutNode, type PaneInfo } from "./split-tree";

/** Drag payload MIME for moving a pane from profile sidebar onto the main display. */
export const PROFILE_PANE_DRAG_MIME = "application/x-ai-shelf-profile-pane";

export interface ProfilePaneDragPayload {
  profileId: string;
  paneId: string;
}

export function encodeProfilePaneDrag(payload: ProfilePaneDragPayload): string {
  return JSON.stringify(payload);
}

/** Set drag payload (custom MIME + text/plain fallback for drop). */
export function writeProfilePaneDrag(
  dataTransfer: DataTransfer,
  payload: ProfilePaneDragPayload,
): void {
  const encoded = encodeProfilePaneDrag(payload);
  dataTransfer.setData(PROFILE_PANE_DRAG_MIME, encoded);
  dataTransfer.setData("text/plain", encoded);
  dataTransfer.effectAllowed = "move";
}

/**
 * During dragover, getData() is empty in browsers — use types only.
 */
export function hasProfilePaneDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(PROFILE_PANE_DRAG_MIME);
}

export function decodeProfilePaneDrag(raw: string): ProfilePaneDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as ProfilePaneDragPayload;
    if (typeof parsed.profileId === "string" && typeof parsed.paneId === "string") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readProfilePaneDrag(dataTransfer: DataTransfer): ProfilePaneDragPayload | null {
  const raw =
    dataTransfer.getData(PROFILE_PANE_DRAG_MIME) ||
    dataTransfer.getData("text/plain");
  if (!raw) return null;
  return decodeProfilePaneDrag(raw);
}

export function minimizedSet(ids: Iterable<string> = []): Set<string> {
  return new Set(ids);
}

export function visiblePanes(
  layout: LayoutNode | null,
  minimized: ReadonlySet<string>,
): PaneInfo[] {
  if (!layout) return [];
  return collectPanes(layout).filter((p) => !minimized.has(p.id));
}

function filterLayoutByPaneIds(node: LayoutNode, visibleIds: Set<string>): LayoutNode | null {
  if (node.kind === "pane") {
    return visibleIds.has(node.pane.id) ? node : null;
  }
  const first = filterLayoutByPaneIds(node.first, visibleIds);
  const second = filterLayoutByPaneIds(node.second, visibleIds);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

/** Layout tree for the main display area (excludes minimized panes). */
export function buildDisplayLayout(
  layout: LayoutNode | null,
  minimized: ReadonlySet<string>,
  focusedPaneId: string | null,
): LayoutNode | null {
  if (!layout) return null;

  const visible = visiblePanes(layout, minimized);
  if (visible.length === 0) return null;

  if (visible.length === 1) {
    return { kind: "pane", pane: visible[0]! };
  }

  const focusVisible =
    focusedPaneId && visible.some((p) => p.id === focusedPaneId)
      ? findPane(layout, focusedPaneId)
      : null;
  if (focusVisible && visible.length > 1) {
    const othersMinimized = visible.every(
      (p) => p.id === focusVisible.id || minimized.has(p.id),
    );
    if (othersMinimized) {
      return { kind: "pane", pane: focusVisible };
    }
  }

  const visibleIds = new Set(visible.map((p) => p.id));
  return filterLayoutByPaneIds(layout, visibleIds);
}

/** Minimize every pane except `displayPaneId` so only one shows in the main area. */
export function minimizedForSingleDisplay(
  layout: LayoutNode | null,
  displayPaneId: string,
): string[] {
  if (!layout) return [];
  return collectPanes(layout)
    .map((p) => p.id)
    .filter((id) => id !== displayPaneId);
}

export function unminimizePaneIds(
  current: ReadonlySet<string>,
  paneIds: string[],
): Set<string> {
  const next = new Set(current);
  for (const id of paneIds) next.delete(id);
  return next;
}

/**
 * Saved snapshot rows are a restore preview for inactive profiles only.
 * The active profile (or any profile with live panes) must not fall back to
 * stale saved terminals after the user closed every pane.
 */
export function shouldShowSavedTerminalPreview(
  liveCount: number,
  isActiveProfile: boolean,
): boolean {
  return liveCount === 0 && !isActiveProfile;
}
