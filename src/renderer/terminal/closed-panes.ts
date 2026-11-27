import { collectPanes, findPane, type LayoutNode, type PaneInfo, type SplitDirection } from "./split-tree";

/**
 * "Reopen closed pane" (like a browser's Ctrl+Shift+T) — pure model, no DOM / Electron.
 *
 * When the user closes a single pane we keep what is needed to start it again
 * (tool, cwd, user title, agent conversation id, task link) and where it sat in
 * the split tree. Entries live in memory only (not persisted across restarts),
 * per profile, tagged with the view window the pane was closed in (null = the
 * origin window's own layout). Each (profile, view) bucket keeps the newest
 * {@link CLOSED_PANE_STACK_MAX} entries.
 */

export const CLOSED_PANE_STACK_MAX = 10;

export type ClosedPaneZone = "left" | "right" | "above" | "below";

/** Where a closed pane sat, relative to what was next to it. */
export interface ClosedPanePosition {
  /** Leaf of the sibling subtree that touched the closed pane. */
  anchorPaneId: string;
  /** The sibling subtree's split id when the sibling was a split (re-wrapped whole if still there). */
  siblingSplitId?: string;
  /** Id of the split that held the closed pane; reused on reinsert so later entries can find it. */
  parentSplitId: string;
  /** Side of the anchor / sibling the closed pane was on. */
  zone: ClosedPaneZone;
  /** The parent split's ratio (share of its first child). */
  ratio: number;
}

export interface ClosedPaneEntry {
  /** Id the pane had; anchors in other entries are remapped when it comes back with a new id. */
  paneId: string;
  tool: string;
  cwd: string;
  title?: string;
  agentSessionId?: string;
  taskId?: string;
  /** View window it was closed in; null = the origin window. */
  viewId: string | null;
  /** null = it was the only pane of its layout. */
  position: ClosedPanePosition | null;
  closedAt: number;
}

/** Entries per profile key (`${workspaceId}:${profileId}`), oldest first. */
export type ClosedPaneStacks = Readonly<Record<string, readonly ClosedPaneEntry[]>>;

type SplitNode = Extract<LayoutNode, { kind: "split" }>;

function firstLeaf(node: LayoutNode): PaneInfo {
  return node.kind === "pane" ? node.pane : firstLeaf(node.first);
}

function lastLeaf(node: LayoutNode): PaneInfo {
  return node.kind === "pane" ? node.pane : lastLeaf(node.second);
}

function parentOfPane(node: LayoutNode, paneId: string): SplitNode | null {
  if (node.kind === "pane") return null;
  for (const child of [node.first, node.second]) {
    if (child.kind === "pane" && child.pane.id === paneId) return node;
  }
  return parentOfPane(node.first, paneId) ?? parentOfPane(node.second, paneId);
}

/** Where `paneId` sits in `tree` (call before removing it); null when it is alone or absent. */
export function recordPanePosition(tree: LayoutNode | null, paneId: string): ClosedPanePosition | null {
  if (!tree) return null;
  const parent = parentOfPane(tree, paneId);
  if (!parent) return null;
  const closedIsFirst = parent.first.kind === "pane" && parent.first.pane.id === paneId;
  const sibling = closedIsFirst ? parent.second : parent.first;
  const zone: ClosedPaneZone =
    parent.direction === "horizontal"
      ? closedIsFirst
        ? "left"
        : "right"
      : closedIsFirst
        ? "above"
        : "below";
  return {
    // The leaf that touched the closed pane: first leaf when the pane was before it, else last.
    anchorPaneId: (closedIsFirst ? firstLeaf(sibling) : lastLeaf(sibling)).id,
    ...(sibling.kind === "split" ? { siblingSplitId: sibling.id } : {}),
    parentSplitId: parent.id,
    zone,
    ratio: parent.ratio,
  };
}

function hasSplitId(node: LayoutNode, splitId: string): boolean {
  if (node.kind === "pane") return false;
  return node.id === splitId || hasSplitId(node.first, splitId) || hasSplitId(node.second, splitId);
}

function zoneDirection(zone: ClosedPaneZone): SplitDirection {
  return zone === "left" || zone === "right" ? "horizontal" : "vertical";
}

function wrap(
  target: LayoutNode,
  pane: PaneInfo,
  zone: ClosedPaneZone,
  splitId: string,
  ratio: number,
): LayoutNode {
  const leaf: LayoutNode = { kind: "pane", pane };
  const paneFirst = zone === "left" || zone === "above";
  return {
    kind: "split",
    id: splitId,
    direction: zoneDirection(zone),
    ratio,
    first: paneFirst ? leaf : target,
    second: paneFirst ? target : leaf,
  };
}

/** Replace the first node matching `match` with `build(node)`; same tree back when none matches. */
function replaceNode(
  node: LayoutNode,
  match: (n: LayoutNode) => boolean,
  build: (n: LayoutNode) => LayoutNode,
): LayoutNode {
  if (match(node)) return build(node);
  if (node.kind === "pane") return node;
  const first = replaceNode(node.first, match, build);
  if (first !== node.first) return { ...node, first };
  const second = replaceNode(node.second, match, build);
  return second === node.second ? node : { ...node, second };
}

function clampRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(0.9, Math.max(0.1, ratio)) : 0.5;
}

let splitSeq = 0;
function freshSplitId(): string {
  splitSeq += 1;
  return `split-${Date.now()}-r${splitSeq}`;
}

export interface ReinsertResult {
  layout: LayoutNode;
  /** True when the pane went back beside its old neighbour (not the fallback). */
  restored: boolean;
  /** Pane the new one now sits beside, if any. */
  anchorPaneId: string | null;
}

/**
 * Put a reopened pane back where it was: beside its old sibling subtree (or the
 * leaf that touched it) with the old split ratio. When the neighbour is gone it
 * is split off `fallbackPaneId` (the focused pane) — or the last pane — to the right.
 */
export function reinsertClosedPane(
  tree: LayoutNode | null,
  pane: PaneInfo,
  position: ClosedPanePosition | null,
  fallbackPaneId: string | null,
): ReinsertResult {
  if (!tree) return { layout: { kind: "pane", pane }, restored: false, anchorPaneId: null };
  if (position) {
    const splitId = hasSplitId(tree, position.parentSplitId) ? freshSplitId() : position.parentSplitId;
    const ratio = clampRatio(position.ratio);
    const siblingId = position.siblingSplitId;
    if (siblingId && hasSplitId(tree, siblingId)) {
      const layout = replaceNode(
        tree,
        (n) => n.kind === "split" && n.id === siblingId,
        (n) => wrap(n, pane, position.zone, splitId, ratio),
      );
      return { layout, restored: true, anchorPaneId: position.anchorPaneId };
    }
    if (findPane(tree, position.anchorPaneId)) {
      const layout = replaceNode(
        tree,
        (n) => n.kind === "pane" && n.pane.id === position.anchorPaneId,
        (n) => wrap(n, pane, position.zone, splitId, ratio),
      );
      return { layout, restored: true, anchorPaneId: position.anchorPaneId };
    }
  }
  const panes = collectPanes(tree);
  const target =
    (fallbackPaneId && panes.find((p) => p.id === fallbackPaneId)) || panes[panes.length - 1]!;
  const layout = replaceNode(
    tree,
    (n) => n.kind === "pane" && n.pane.id === target.id,
    (n) => wrap(n, pane, "right", freshSplitId(), 0.5),
  );
  return { layout, restored: false, anchorPaneId: target.id };
}

// ---------------------------------------------------------------------------
// Stacks

/** What to keep from a pane that is being closed (read the tree before removing it). */
export function closedPaneEntry(
  pane: PaneInfo,
  tree: LayoutNode | null,
  viewId: string | null,
  now: number = Date.now(),
): ClosedPaneEntry {
  return {
    paneId: pane.id,
    tool: pane.tool,
    cwd: pane.cwd,
    ...(pane.title?.trim() ? { title: pane.title } : {}),
    ...(pane.agentSessionId ? { agentSessionId: pane.agentSessionId } : {}),
    ...(pane.taskId ? { taskId: pane.taskId } : {}),
    viewId,
    position: recordPanePosition(tree, pane.id),
    closedAt: now,
  };
}

/** Add an entry; its (profile, view) bucket keeps the newest `max`. */
export function pushClosedPane(
  stacks: ClosedPaneStacks,
  profileKey: string,
  entry: ClosedPaneEntry,
  max: number = CLOSED_PANE_STACK_MAX,
): ClosedPaneStacks {
  const list = [...(stacks[profileKey] ?? []), entry];
  let excess = list.filter((e) => e.viewId === entry.viewId).length - max;
  const kept = list.filter((e) => {
    if (excess > 0 && e.viewId === entry.viewId) {
      excess -= 1;
      return false;
    }
    return true;
  });
  return { ...stacks, [profileKey]: kept };
}

/**
 * Whether an entry can be reopened from `viewId` (null = the origin window).
 * The origin also takes entries whose view window is gone (its last pane was
 * closed, or the window was closed), so nothing gets stranded.
 */
function entryBelongsTo(
  entry: ClosedPaneEntry,
  viewId: string | null,
  liveViewIds: ReadonlySet<string>,
): boolean {
  if (viewId !== null) return entry.viewId === viewId;
  return entry.viewId === null || !liveViewIds.has(entry.viewId);
}

/** Newest entry reopenable from `viewId`, or null. */
export function peekClosedPane(
  stacks: ClosedPaneStacks,
  profileKey: string | null,
  viewId: string | null,
  liveViewIds: ReadonlySet<string> = new Set(),
): ClosedPaneEntry | null {
  if (!profileKey) return null;
  const list = stacks[profileKey] ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (entryBelongsTo(list[i]!, viewId, liveViewIds)) return list[i]!;
  }
  return null;
}

export function countClosedPanes(
  stacks: ClosedPaneStacks,
  profileKey: string | null,
  viewId: string | null,
  liveViewIds: ReadonlySet<string> = new Set(),
): number {
  if (!profileKey) return 0;
  return (stacks[profileKey] ?? []).filter((e) => entryBelongsTo(e, viewId, liveViewIds)).length;
}

export function removeClosedPane(
  stacks: ClosedPaneStacks,
  profileKey: string,
  entry: ClosedPaneEntry,
): ClosedPaneStacks {
  const list = stacks[profileKey];
  if (!list || !list.includes(entry)) return stacks;
  const next = list.filter((e) => e !== entry);
  const out = { ...stacks };
  if (next.length > 0) out[profileKey] = next;
  else delete out[profileKey];
  return out;
}

/**
 * A reopened pane has a new id: point the remaining entries that sat beside the
 * old one at the new one, so reopening several panes in a row restores them all.
 */
export function remapClosedPaneAnchor(
  stacks: ClosedPaneStacks,
  profileKey: string,
  oldPaneId: string,
  newPaneId: string,
): ClosedPaneStacks {
  const list = stacks[profileKey];
  if (!list || oldPaneId === newPaneId) return stacks;
  let changed = false;
  const next = list.map((e) => {
    if (e.position?.anchorPaneId !== oldPaneId) return e;
    changed = true;
    return { ...e, position: { ...e.position, anchorPaneId: newPaneId } };
  });
  return changed ? { ...stacks, [profileKey]: next } : stacks;
}

