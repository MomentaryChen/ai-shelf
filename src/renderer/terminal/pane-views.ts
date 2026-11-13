import {
  collectPanes,
  equalizeRunAroundPane,
  findPane,
  removePaneFromTree,
  splitPaneInTree,
  type LayoutNode,
  type PaneInfo,
} from "./split-tree";
import type { SerializedLayoutNode } from "./layout-serialize";

/**
 * A profile "view": an extra window that shows some of one profile's panes.
 * Every pane stays in its profile's layout tree (so the pane limit, agent
 * tracking and layout saving are unchanged); the view only adds its own small
 * split tree of those panes on top, and the origin hides them from its display.
 */
export interface PaneViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaneView {
  id: string;
  /** `${workspaceId}:${profileId}` */
  profileKey: string;
  /** Leaves hold the pane info as of the last resolve; always re-resolve by id. */
  layout: LayoutNode;
  focusedPaneId: string | null;
  bounds: PaneViewRect | null;
}

/** Saved per machine; leaf indices point into the profile layout's pane order (DFS). */
export interface SavedPaneView {
  layout: SerializedLayoutNode;
  bounds: PaneViewRect | null;
}

export function newViewId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function viewPaneIds(view: PaneView): string[] {
  return collectPanes(view.layout).map((p) => p.id);
}

/** Pane ids of `profileKey` that live in a view (hidden from the origin display). */
export function hiddenPaneIds(views: PaneView[], profileKey: string | null): Set<string> {
  const out = new Set<string>();
  if (!profileKey) return out;
  for (const v of views) {
    if (v.profileKey !== profileKey) continue;
    for (const id of viewPaneIds(v)) out.add(id);
  }
  return out;
}

export function findViewOfPane(views: PaneView[], paneId: string): PaneView | null {
  return views.find((v) => findPane(v.layout, paneId) !== null) ?? null;
}

/** Take the pane out of whichever view holds it; views left empty are dropped. */
export function removePaneFromViews(views: PaneView[], paneId: string): PaneView[] {
  let changed = false;
  const out: PaneView[] = [];
  for (const v of views) {
    if (!findPane(v.layout, paneId)) {
      out.push(v);
      continue;
    }
    changed = true;
    const layout = removePaneFromTree(v.layout, paneId);
    if (!layout) continue;
    const ids = collectPanes(layout).map((p) => p.id);
    out.push({
      ...v,
      layout,
      focusedPaneId:
        v.focusedPaneId && v.focusedPaneId !== paneId ? v.focusedPaneId : (ids[0] ?? null),
    });
  }
  return changed ? out : views;
}

/** Add a pane beside the view's focused pane (or its last one) and focus it. */
export function addPaneToView(view: PaneView, pane: PaneInfo): PaneView {
  if (findPane(view.layout, pane.id)) return { ...view, focusedPaneId: pane.id };
  const panes = collectPanes(view.layout);
  const anchor =
    (view.focusedPaneId && panes.find((p) => p.id === view.focusedPaneId)) ||
    panes[panes.length - 1];
  if (!anchor) return { ...view, layout: { kind: "pane", pane }, focusedPaneId: pane.id };
  const layout = equalizeRunAroundPane(
    splitPaneInTree(view.layout, anchor.id, "horizontal", pane),
    pane.id,
  );
  return { ...view, layout, focusedPaneId: pane.id };
}

function resolveNode(
  node: LayoutNode,
  lookup: (paneId: string) => PaneInfo | null,
): LayoutNode | null {
  if (node.kind === "pane") {
    const pane = lookup(node.pane.id);
    if (!pane) return null;
    return pane === node.pane ? node : { kind: "pane", pane };
  }
  const first = resolveNode(node.first, lookup);
  const second = resolveNode(node.second, lookup);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

/**
 * Refresh each view's pane info from its profile layout (cwd, title, a new
 * session after a restart) and drop panes that no longer exist; empty views go.
 * Returns the same array when nothing changed, so it can drive a state update.
 */
export function resolveViews(
  views: PaneView[],
  lookup: (profileKey: string, paneId: string) => PaneInfo | null,
): PaneView[] {
  let changed = false;
  const out: PaneView[] = [];
  for (const v of views) {
    const layout = resolveNode(v.layout, (id) => lookup(v.profileKey, id));
    if (layout === v.layout) {
      out.push(v);
      continue;
    }
    changed = true;
    if (!layout) continue;
    const ids = collectPanes(layout).map((p) => p.id);
    out.push({
      ...v,
      layout,
      focusedPaneId:
        v.focusedPaneId && ids.includes(v.focusedPaneId) ? v.focusedPaneId : (ids[0] ?? null),
    });
  }
  return changed ? out : views;
}

/** Views of one profile → saved form, indexed by pane position in `profileLayout`. */
export function serializeViews(
  views: PaneView[],
  profileLayout: LayoutNode | null,
): SavedPaneView[] {
  if (!profileLayout) return [];
  const index = new Map(collectPanes(profileLayout).map((p, i) => [p.id, i]));
  const walk = (node: LayoutNode): SerializedLayoutNode | null => {
    if (node.kind === "pane") {
      const i = index.get(node.pane.id);
      return i === undefined ? null : { kind: "pane", index: i };
    }
    const first = walk(node.first);
    const second = walk(node.second);
    if (!first || !second) return first ?? second;
    return {
      kind: "split",
      id: node.id,
      direction: node.direction,
      ratio: node.ratio,
      first,
      second,
    };
  };
  const out: SavedPaneView[] = [];
  for (const v of views) {
    const layout = walk(v.layout);
    if (layout) out.push({ layout, bounds: v.bounds });
  }
  return out;
}

function parseRect(raw: unknown): PaneViewRect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vals = [r.x, r.y, r.width, r.height];
  if (!vals.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [x, y, width, height] = vals as number[];
  if (width! <= 0 || height! <= 0) return null;
  return { x: x!, y: y!, width: width!, height: height! };
}

/**
 * Saved views → live views for a freshly restored profile. `slotPanes[i]` is the
 * pane restored for saved slot i (null when it failed to start). Panes that are
 * missing or already used by an earlier view are left out; empty views dropped.
 */
export function deserializeViews(
  saved: unknown[],
  slotPanes: (PaneInfo | null)[],
  profileKey: string,
  makeId: () => string = newViewId,
): PaneView[] {
  const used = new Set<string>();
  const build = (raw: unknown, depth: number): LayoutNode | null => {
    if (!raw || typeof raw !== "object" || depth > 32) return null;
    const n = raw as Record<string, unknown>;
    if (n.kind === "pane") {
      const i = n.index;
      if (typeof i !== "number" || !Number.isInteger(i)) return null;
      const pane = slotPanes[i];
      if (!pane || used.has(pane.id)) return null;
      used.add(pane.id);
      return { kind: "pane", pane };
    }
    if (n.kind !== "split") return null;
    const first = build(n.first, depth + 1);
    const second = build(n.second, depth + 1);
    if (!first || !second) return first ?? second;
    const ratio = typeof n.ratio === "number" && Number.isFinite(n.ratio) ? n.ratio : 0.5;
    return {
      kind: "split",
      id: typeof n.id === "string" && n.id ? n.id : `split-${makeId()}`,
      direction: n.direction === "vertical" ? "vertical" : "horizontal",
      ratio: Math.min(0.9, Math.max(0.1, ratio)),
      first,
      second,
    };
  };
  const out: PaneView[] = [];
  for (const entry of saved) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const layout = build(e.layout, 0);
    if (!layout) continue;
    out.push({
      id: makeId(),
      profileKey,
      layout,
      focusedPaneId: collectPanes(layout)[0]?.id ?? null,
      bounds: parseRect(e.bounds),
    });
  }
  return out;
}
