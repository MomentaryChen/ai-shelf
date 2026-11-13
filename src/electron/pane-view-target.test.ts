import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePaneDropTarget, type DragSource, type DropWindow } from "./pane-view-target.js";

const origin: DropWindow = {
  kind: "origin",
  id: 1,
  bounds: { x: 0, y: 0, width: 1200, height: 800 },
};
const viewA: DropWindow = {
  kind: "view",
  id: 10,
  bounds: { x: 2000, y: 100, width: 800, height: 500 },
  viewId: "va",
  originId: 1,
  profileKey: "w:a",
};
const viewB: DropWindow = {
  kind: "view",
  id: 11,
  bounds: { x: 3000, y: 100, width: 800, height: 500 },
  viewId: "vb",
  originId: 1,
  profileKey: "w:b",
};
const settings: DropWindow = {
  kind: "other",
  id: 5,
  bounds: { x: 300, y: 300, width: 400, height: 400 },
};

const fromOrigin: DragSource = { paneId: "p", originId: 1, profileKey: "w:a", fromViewId: null };
const fromViewA: DragSource = { ...fromOrigin, fromViewId: "va" };

describe("resolvePaneDropTarget", () => {
  it("opens a new view outside every window", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 1500, y: 50 }, [origin, viewA], fromOrigin), {
      kind: "new-view",
    });
  });

  it("does nothing when dropped back on the origin it is already shown in", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 100, y: 100 }, [origin], fromOrigin), {
      kind: "none",
    });
  });

  it("docks a pane dragged from a view onto its origin", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 100, y: 100 }, [viewA, origin], fromViewA), {
      kind: "dock",
    });
  });

  it("moves into another view of the same profile", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 2100, y: 200 }, [origin, viewA], fromOrigin), {
      kind: "into-view",
      viewId: "va",
    });
  });

  it("rejects a view of another profile and names that window", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 3100, y: 200 }, [viewB, origin], fromOrigin), {
      kind: "reject",
      windowId: 11,
    });
  });

  it("rejects a same-profile view that belongs to another origin window", () => {
    const otherOrigin: DropWindow = { ...viewA, id: 12, originId: 2 } as DropWindow;
    assert.deepEqual(resolvePaneDropTarget({ x: 2100, y: 200 }, [otherOrigin], fromOrigin), {
      kind: "reject",
      windowId: 12,
    });
  });

  it("does nothing when released on its own view", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 2100, y: 200 }, [viewA], fromViewA), {
      kind: "none",
    });
  });

  it("ignores other app windows (settings)", () => {
    assert.deepEqual(resolvePaneDropTarget({ x: 400, y: 400 }, [settings, origin], fromOrigin), {
      kind: "none",
    });
  });

  it("resolves overlaps to the front-most window", () => {
    const overlapping: DropWindow = {
      ...viewA,
      bounds: { x: 500, y: 300, width: 800, height: 500 },
    } as DropWindow;
    const point = { x: 600, y: 400 };
    // View focused last → it is on top → move into it.
    assert.deepEqual(resolvePaneDropTarget(point, [overlapping, origin], fromOrigin), {
      kind: "into-view",
      viewId: "va",
    });
    // Origin focused last → it is on top → same-window drop, nothing.
    assert.deepEqual(resolvePaneDropTarget(point, [origin, overlapping], fromOrigin), {
      kind: "none",
    });
  });
});
