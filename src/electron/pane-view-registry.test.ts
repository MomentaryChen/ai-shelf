import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectDeclPanes,
  PaneViewRegistry,
  type PaneViewDecl,
  type ViewLayoutDecl,
} from "./pane-view-registry.js";

function leaf(id: string): ViewLayoutDecl {
  return { kind: "pane", pane: { id, tool: "shell", sessionId: `s-${id}`, cwd: "/w" } };
}

function decl(
  viewId: string,
  layout: ViewLayoutDecl,
  busy: Record<string, boolean> = {},
): PaneViewDecl {
  return {
    viewId,
    profileKey: "w:a",
    profileName: "A",
    accentColor: null,
    layout,
    focusedPaneId: null,
    labels: {},
    busy,
    bounds: null,
  };
}

const two: ViewLayoutDecl = {
  kind: "split",
  id: "s",
  direction: "horizontal",
  ratio: 0.5,
  first: leaf("p1"),
  second: leaf("p2"),
};

describe("collectDeclPanes", () => {
  it("lists panes in order", () => {
    assert.deepEqual(
      collectDeclPanes(two).map((p) => p.id),
      ["p1", "p2"],
    );
  });
});

describe("PaneViewRegistry", () => {
  it("finds a view by id, window, pane and origin", () => {
    const r = new PaneViewRegistry();
    r.set({ decl: decl("v1", two), originId: 1, windowId: 20 });
    r.set({ decl: decl("v2", leaf("p3")), originId: 2, windowId: 21 });
    assert.equal(r.byView("v1")?.windowId, 20);
    assert.equal(r.byWindow(21)?.decl.viewId, "v2");
    assert.equal(r.byPane("p2")?.decl.viewId, "v1");
    assert.equal(r.byPane("nope"), null);
    assert.deepEqual(
      r.byOrigin(1).map((e) => e.decl.viewId),
      ["v1"],
    );
  });

  it("lists the sessions a view window owns", () => {
    const r = new PaneViewRegistry();
    r.set({ decl: decl("v1", two), originId: 1, windowId: 20 });
    assert.deepEqual(r.sessionsOf("v1"), ["s-p1", "s-p2"]);
    assert.deepEqual(r.sessionsOf("missing"), []);
  });

  it("reports busy when any pane is busy", () => {
    const r = new PaneViewRegistry();
    r.set({ decl: decl("v1", two, { p2: true }), originId: 1, windowId: 20 });
    r.set({ decl: decl("v2", leaf("p3"), { p3: false }), originId: 1, windowId: 21 });
    assert.equal(r.anyBusy("v1"), true);
    assert.equal(r.anyBusy("v2"), false);
  });

  it("a newer declaration replaces the old one", () => {
    const r = new PaneViewRegistry();
    r.set({ decl: decl("v1", two), originId: 1, windowId: 20 });
    r.set({ decl: decl("v1", leaf("p1")), originId: 1, windowId: 20 });
    assert.equal(r.byPane("p2"), null);
    assert.equal(r.remove("v1")?.windowId, 20);
    assert.equal(r.all().length, 0);
  });
});
