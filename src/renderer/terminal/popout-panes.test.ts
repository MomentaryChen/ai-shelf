import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectPanes, type LayoutNode, type PaneInfo } from "./split-tree.js";
import { serializeLayout } from "./layout-serialize.js";
import {
  displayLayoutWithoutPoppedOut,
  focusAfterPopOut,
  removePaneFromCachedLayout,
  withoutPoppedOut,
} from "./popout-panes.js";

function pane(id: string): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: "/tmp" };
}

function leaf(id: string): LayoutNode {
  return { kind: "pane", pane: pane(id) };
}

// [a | [b / c]]
const tree: LayoutNode = {
  kind: "split",
  id: "root",
  direction: "horizontal",
  ratio: 0.5,
  first: leaf("a"),
  second: {
    kind: "split",
    id: "right",
    direction: "vertical",
    ratio: 0.5,
    first: leaf("b"),
    second: leaf("c"),
  },
};

const ids = (node: LayoutNode | null) => collectPanes(node).map((p) => p.id);

describe("withoutPoppedOut", () => {
  it("drops popped-out panes and keeps order", () => {
    const panes = collectPanes(tree);
    assert.deepEqual(
      withoutPoppedOut(panes, new Set(["b"])).map((p) => p.id),
      ["a", "c"],
    );
  });

  it("returns the same array when nothing is popped out", () => {
    const panes = collectPanes(tree);
    assert.equal(withoutPoppedOut(panes, new Set()), panes);
  });
});

describe("displayLayoutWithoutPoppedOut", () => {
  it("hides a popped-out pane and collapses its split", () => {
    const shown = displayLayoutWithoutPoppedOut(tree, new Set(["b"]), "a");
    assert.deepEqual(ids(shown), ["a", "c"]);
    assert.equal(shown?.kind, "split");
  });

  it("returns null when every displayed pane is popped out", () => {
    assert.equal(displayLayoutWithoutPoppedOut(leaf("a"), new Set(["a"]), "a"), null);
  });

  it("is a no-op without popped-out panes", () => {
    assert.equal(displayLayoutWithoutPoppedOut(tree, new Set(), null), tree);
  });

  it("keeps the popped-out pane in the saved layout (restore lands in the origin window)", () => {
    // Hiding is display-only: the layout tree that gets persisted is untouched.
    displayLayoutWithoutPoppedOut(tree, new Set(["b"]), "a");
    const saved = serializeLayout(tree);
    assert.equal(saved.panes.length, 3);
  });
});

describe("focusAfterPopOut", () => {
  it("keeps focus on another pane", () => {
    assert.equal(focusAfterPopOut(tree, new Set(["b"]), "b", "c"), "c");
  });

  it("moves focus off the popped-out pane to the first shown one", () => {
    assert.equal(focusAfterPopOut(tree, new Set(["b"]), "b", "b"), "a");
  });

  it("skips hidden panes", () => {
    assert.equal(focusAfterPopOut(tree, new Set(["a", "b"]), "b", "b"), "c");
  });

  it("is null when nothing is left on screen", () => {
    assert.equal(focusAfterPopOut(leaf("a"), new Set(["a"]), "a", "a"), null);
  });
});

describe("removePaneFromCachedLayout", () => {
  it("removes the pane and fixes focus / minimized ids", () => {
    const next = removePaneFromCachedLayout(
      { layout: tree, focusedPaneId: "b", minimizedPaneIds: ["b", "c"] },
      "b",
    );
    assert.ok(next);
    assert.deepEqual(ids(next.layout), ["a", "c"]);
    assert.equal(next.focusedPaneId, "a");
    assert.deepEqual(next.minimizedPaneIds, ["c"]);
  });

  it("returns null when it was the profile's last pane", () => {
    assert.equal(
      removePaneFromCachedLayout({ layout: leaf("a"), focusedPaneId: "a", minimizedPaneIds: [] }, "a"),
      null,
    );
  });

  it("leaves an entry without that pane untouched", () => {
    const entry = { layout: tree, focusedPaneId: "a", minimizedPaneIds: [] };
    assert.equal(removePaneFromCachedLayout(entry, "zzz"), entry);
  });
});
