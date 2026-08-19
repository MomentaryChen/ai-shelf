import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LayoutNode, PaneInfo } from "./split-tree.js";
import {
  buildDisplayLayout,
  shouldShowSavedTerminalPreview,
} from "./profile-pane-display.js";

function pane(id: string): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: "/tmp" };
}

describe("buildDisplayLayout", () => {
  it("returns null when every pane is minimized", () => {
    const a = pane("a");
    const b = pane("b");
    const layout: LayoutNode = {
      kind: "split",
      id: "split-1",
      direction: "horizontal",
      ratio: 0.5,
      first: { kind: "pane", pane: a },
      second: { kind: "pane", pane: b },
    };
    assert.equal(buildDisplayLayout(layout, new Set(["a", "b"]), "a"), null);
  });

  it("returns null when layout is empty", () => {
    assert.equal(buildDisplayLayout(null, new Set(), null), null);
  });
});

describe("shouldShowSavedTerminalPreview", () => {
  it("hides saved terminals on the active profile after all live panes are gone", () => {
    assert.equal(shouldShowSavedTerminalPreview(0, true), false);
  });

  it("keeps a restore preview for inactive profiles with no live panes", () => {
    assert.equal(shouldShowSavedTerminalPreview(0, false), true);
  });

  it("does not use the saved preview while live panes exist", () => {
    assert.equal(shouldShowSavedTerminalPreview(2, false), false);
    assert.equal(shouldShowSavedTerminalPreview(1, true), false);
  });
});
