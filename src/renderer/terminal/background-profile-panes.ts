import { collectPanes, type LayoutNode, type PaneInfo } from "./split-tree";

/** A live pane that belongs to a stashed (non-active) profile. */
export interface BackgroundProfilePane {
  workspaceId: string;
  profileId: string;
  pane: PaneInfo;
}

/** Split a `${workspaceId}:${profileId}` live-cache key. */
export function parseProfileCacheKey(key: string): { workspaceId: string; profileId: string } {
  const idx = key.indexOf(":");
  if (idx < 0) return { workspaceId: "", profileId: key };
  return { workspaceId: key.slice(0, idx), profileId: key.slice(idx + 1) };
}

/** Panes from every cached profile except the active one (`activeKey`). */
export function collectBackgroundProfilePanes(
  entries: Iterable<[string, { layout: LayoutNode }]>,
  activeKey: string | null,
): BackgroundProfilePane[] {
  const out: BackgroundProfilePane[] = [];
  for (const [key, entry] of entries) {
    if (key === activeKey) continue;
    const { workspaceId, profileId } = parseProfileCacheKey(key);
    for (const pane of collectPanes(entry.layout)) {
      out.push({ workspaceId, profileId, pane });
    }
  }
  return out;
}

/**
 * Map that calls `onChange` when a key is added/removed or a value's `layout`
 * reference changes — focus/minimize-only updates stay silent so they do not
 * re-render consumers of the background pane list.
 */
export class LayoutChangeNotifyingMap<V extends { layout: LayoutNode }> extends Map<string, V> {
  constructor(private readonly onChange: () => void) {
    super();
  }

  override set(key: string, value: V): this {
    const prev = super.get(key);
    super.set(key, value);
    // `onChange` is undefined while the base constructor runs.
    if (this.onChange && prev?.layout !== value.layout) this.onChange();
    return this;
  }

  override delete(key: string): boolean {
    const removed = super.delete(key);
    if (removed) this.onChange();
    return removed;
  }

  override clear(): void {
    const had = this.size > 0;
    super.clear();
    if (had) this.onChange();
  }
}
