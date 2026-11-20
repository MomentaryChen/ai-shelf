import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Reverse portal for kept terminals.
 *
 * Each session gets one detached host node. The terminal renders into it via
 * `createPortal` from a fixed spot in the tree, so React never remounts it.
 * Wherever the pane is laid out, a `TerminalHostSlot` moves that node in;
 * when the slot goes away the node returns to a hidden parking lot.
 */

const PARKING_ID = "terminal-keep-alive-parking";

function parkingLot(): HTMLElement {
  let lot = document.getElementById(PARKING_ID);
  if (!lot) {
    lot = document.createElement("div");
    lot.id = PARKING_ID;
    lot.setAttribute("aria-hidden", "true");
    // display:none — xterm pauses rendering and fit sees a zero-size box.
    lot.style.display = "none";
    document.body.appendChild(lot);
  }
  return lot;
}

export type TerminalHostNodes = {
  /** Host node for a session (created on first use, parked until slotted). */
  get: (sessionId: string) => HTMLDivElement;
  /** Remove host nodes of sessions no longer kept. */
  prune: (keep: ReadonlySet<string>) => void;
};

export function useTerminalHostNodes(): TerminalHostNodes {
  const mapRef = useRef(new Map<string, HTMLDivElement>());

  const get = useCallback((sessionId: string) => {
    const map = mapRef.current;
    let node = map.get(sessionId);
    if (!node) {
      node = document.createElement("div");
      node.className = "absolute inset-0";
      node.dataset.terminalHost = sessionId;
      parkingLot().appendChild(node);
      map.set(sessionId, node);
    }
    return node;
  }, []);

  const prune = useCallback((keep: ReadonlySet<string>) => {
    const map = mapRef.current;
    for (const [sessionId, node] of map) {
      if (keep.has(sessionId)) continue;
      map.delete(sessionId);
      node.remove();
    }
  }, []);

  // Take parked nodes out of the document on unmount. The map is left intact:
  // StrictMode replays this cleanup on a live component, and the portals still
  // point at these nodes (slotted ones are moved back in by their slots).
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      for (const node of map.values()) {
        if (node.parentElement?.id === PARKING_ID) node.remove();
      }
    };
  }, []);

  return { get, prune };
}

/*
 * React events follow the component tree, not the DOM. The terminal's React
 * parent is the portal host, so events from inside it would skip the pane shell
 * (click-to-focus, pane / file drag-and-drop). Re-dispatch them from the slot so
 * they take the slot's React path; the copy shares the original's DataTransfer,
 * and preventDefault is passed back so drops still work.
 */
const FORWARDED_EVENTS = ["mousedown", "dragenter", "dragover", "dragleave", "drop"] as const;

function forwardThroughSlot(slot: HTMLElement) {
  return (e: Event) => {
    e.stopPropagation();
    // An Event reads as its own init dictionary (clientX, relatedTarget, dataTransfer…).
    const copy =
      e instanceof DragEvent
        ? new DragEvent(e.type, e as unknown as DragEventInit)
        : new MouseEvent(e.type, e as unknown as MouseEventInit);
    slot.dispatchEvent(copy);
    if (copy.defaultPrevented) e.preventDefault();
  };
}

/** Focused element inside a host node that was parked in the current commit. */
const focusAtPark = new WeakMap<HTMLElement, HTMLElement>();

/** Where a kept terminal shows: moves its host node in, parks it on unmount. */
export function TerminalHostSlot({ node }: { node: HTMLDivElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    if (!slot) return;
    slot.appendChild(node);
    // Moving a node blurs it. When the pane only changed slots (a sibling
    // closed, a split moved) put the caret back where it was.
    const refocus = focusAtPark.get(node);
    focusAtPark.delete(node);
    if (refocus && node.contains(refocus)) refocus.focus({ preventScroll: true });

    const forward = forwardThroughSlot(slot);
    for (const type of FORWARDED_EVENTS) node.addEventListener(type, forward);
    return () => {
      for (const type of FORWARDED_EVENTS) node.removeEventListener(type, forward);
      // Another slot may already have claimed the node in this commit.
      if (node.parentElement !== slot) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && node.contains(active)) {
        focusAtPark.set(node, active);
        // Only a re-slot in this same commit restores it.
        queueMicrotask(() => focusAtPark.delete(node));
      }
      parkingLot().appendChild(node);
    };
  }, [node]);
  return <div ref={ref} className="absolute inset-0" />;
}
