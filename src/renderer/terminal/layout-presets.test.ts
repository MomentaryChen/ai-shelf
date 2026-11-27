import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLayoutPreset,
  buildPresetLayout,
  gridRowSizes,
  isLayoutPreset,
  LAYOUT_PRESETS,
  MAIN_SIDE_RATIO,
} from "./layout-presets.js";
import { buildDisplayLayout } from "./profile-pane-display.js";
import { collectPanes, paneRects, type LayoutNode, type PaneInfo, type PaneRect } from "./split-tree.js";

function pane(id: string): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: "/tmp" };
}

function panes(n: number): PaneInfo[] {
  return Array.from({ length: n }, (_, i) => pane(`p${i + 1}`));
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function assertRect(actual: PaneRect | undefined, expected: PaneRect, label: string) {
  assert.ok(actual, `${label}: missing`);
  for (const k of ["x", "y", "w", "h"] as const) {
    assert.ok(near(actual[k], expected[k]), `${label}.${k}: ${actual[k]} != ${expected[k]}`);
  }
}

function rectsOf(node: LayoutNode | null): Map<string, PaneRect> {
  assert.ok(node);
  return paneRects(node);
}

/** A strip of the given panes: the existing layout before a preset is applied. */
function chain(ps: PaneInfo[], direction: "horizontal" | "vertical" = "horizontal"): LayoutNode {
  let root: LayoutNode = { kind: "pane", pane: ps[0]! };
  for (let i = 1; i < ps.length; i++) {
    root = {
      kind: "split",
      id: `s${i}`,
      direction,
      ratio: 0.3,
      first: root,
      second: { kind: "pane", pane: ps[i]! },
    };
  }
  return root;
}

describe("isLayoutPreset", () => {
  it("accepts the known presets only", () => {
    for (const p of LAYOUT_PRESETS) assert.equal(isLayoutPreset(p), true);
    assert.equal(isLayoutPreset("diagonal"), false);
    assert.equal(isLayoutPreset(undefined), false);
    assert.equal(isLayoutPreset(3), false);
  });
});

describe("gridRowSizes", () => {
  it("is as square as possible, longer rows first", () => {
    assert.deepEqual(gridRowSizes(0), []);
    assert.deepEqual(gridRowSizes(1), [1]);
    assert.deepEqual(gridRowSizes(2), [2]);
    assert.deepEqual(gridRowSizes(3), [2, 1]);
    assert.deepEqual(gridRowSizes(4), [2, 2]);
    assert.deepEqual(gridRowSizes(5), [3, 2]);
    assert.deepEqual(gridRowSizes(6), [3, 3]);
    assert.deepEqual(gridRowSizes(7), [3, 2, 2]);
    assert.deepEqual(gridRowSizes(8), [3, 3, 2]);
    assert.deepEqual(gridRowSizes(9), [3, 3, 3]);
  });
});

describe("buildPresetLayout", () => {
  it("columns: equal widths, left to right in order", () => {
    const rects = rectsOf(buildPresetLayout(panes(3), "columns", null));
    assertRect(rects.get("p1"), { x: 0, y: 0, w: 1 / 3, h: 1 }, "p1");
    assertRect(rects.get("p2"), { x: 1 / 3, y: 0, w: 1 / 3, h: 1 }, "p2");
    assertRect(rects.get("p3"), { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }, "p3");
  });

  it("rows: equal heights, top to bottom in order", () => {
    const rects = rectsOf(buildPresetLayout(panes(4), "rows", null));
    for (let i = 0; i < 4; i++) {
      assertRect(rects.get(`p${i + 1}`), { x: 0, y: i / 4, w: 1, h: 1 / 4 }, `p${i + 1}`);
    }
  });

  it("grid 4: 2x2", () => {
    const rects = rectsOf(buildPresetLayout(panes(4), "grid", null));
    assertRect(rects.get("p1"), { x: 0, y: 0, w: 0.5, h: 0.5 }, "p1");
    assertRect(rects.get("p2"), { x: 0.5, y: 0, w: 0.5, h: 0.5 }, "p2");
    assertRect(rects.get("p3"), { x: 0, y: 0.5, w: 0.5, h: 0.5 }, "p3");
    assertRect(rects.get("p4"), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, "p4");
  });

  it("grid 5: 3 on top, 2 below, rows of equal height", () => {
    const rects = rectsOf(buildPresetLayout(panes(5), "grid", null));
    assertRect(rects.get("p1"), { x: 0, y: 0, w: 1 / 3, h: 0.5 }, "p1");
    assertRect(rects.get("p3"), { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 }, "p3");
    assertRect(rects.get("p4"), { x: 0, y: 0.5, w: 0.5, h: 0.5 }, "p4");
    assertRect(rects.get("p5"), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, "p5");
  });

  it("grid 7: three rows of equal height (3 + 2 + 2)", () => {
    const rects = rectsOf(buildPresetLayout(panes(7), "grid", null));
    assertRect(rects.get("p1"), { x: 0, y: 0, w: 1 / 3, h: 1 / 3 }, "p1");
    assertRect(rects.get("p4"), { x: 0, y: 1 / 3, w: 0.5, h: 1 / 3 }, "p4");
    assertRect(rects.get("p7"), { x: 0.5, y: 2 / 3, w: 0.5, h: 1 / 3 }, "p7");
  });

  it("main-side: focused pane left at 60%, the rest stacked on the right in order", () => {
    const rects = rectsOf(buildPresetLayout(panes(4), "main-side", "p3"));
    assertRect(rects.get("p3"), { x: 0, y: 0, w: MAIN_SIDE_RATIO, h: 1 }, "p3");
    const sideW = 1 - MAIN_SIDE_RATIO;
    assertRect(rects.get("p1"), { x: MAIN_SIDE_RATIO, y: 0, w: sideW, h: 1 / 3 }, "p1");
    assertRect(rects.get("p2"), { x: MAIN_SIDE_RATIO, y: 1 / 3, w: sideW, h: 1 / 3 }, "p2");
    assertRect(rects.get("p4"), { x: MAIN_SIDE_RATIO, y: 2 / 3, w: sideW, h: 1 / 3 }, "p4");
  });

  it("main-side: unknown / missing focus uses the first pane", () => {
    const rects = rectsOf(buildPresetLayout(panes(2), "main-side", "gone"));
    assertRect(rects.get("p1"), { x: 0, y: 0, w: MAIN_SIDE_RATIO, h: 1 }, "p1");
    assertRect(rects.get("p2"), { x: MAIN_SIDE_RATIO, y: 0, w: 1 - MAIN_SIDE_RATIO, h: 1 }, "p2");
  });
});

describe("applyLayoutPreset", () => {
  it("keeps every PaneInfo object (ids, sessions, titles) and uses DFS order", () => {
    const ps = panes(5).map((p, i) => ({ ...p, title: `t${i}` }));
    const root = chain(ps, "vertical");
    for (const preset of LAYOUT_PRESETS) {
      const next = applyLayoutPreset(root, preset, { focusedPaneId: "p1" });
      const after = collectPanes(next);
      assert.equal(after.length, ps.length, preset);
      for (const p of ps) assert.ok(after.includes(p), `${preset}: ${p.id} kept by reference`);
      if (preset !== "main-side") assert.deepEqual(after.map((p) => p.id), ps.map((p) => p.id));
    }
  });

  it("returns the tree unchanged with fewer than two visible panes", () => {
    const single: LayoutNode = { kind: "pane", pane: pane("a") };
    assert.equal(applyLayoutPreset(single, "grid"), single);
    const two = chain(panes(2));
    assert.equal(applyLayoutPreset(two, "rows", { hiddenPaneIds: new Set(["p2"]) }), two);
  });

  it("hidden panes stay in the tree but the shown tree is exactly the preset", () => {
    const ps = panes(6);
    const root = chain(ps);
    const hidden = new Set(["p2", "p5"]);
    const visible = ps.filter((p) => !hidden.has(p.id));
    for (const preset of LAYOUT_PRESETS) {
      const next = applyLayoutPreset(root, preset, { hiddenPaneIds: hidden, focusedPaneId: "p4" });
      assert.deepEqual(
        new Set(collectPanes(next).map((p) => p.id)),
        new Set(ps.map((p) => p.id)),
        `${preset}: no pane lost`,
      );
      const shown = buildDisplayLayout(next, hidden, "p4");
      const expected = rectsOf(buildPresetLayout(visible, preset, "p4"));
      const actual = rectsOf(shown);
      assert.equal(actual.size, visible.length, preset);
      for (const [id, r] of expected) assertRect(actual.get(id), r, `${preset} ${id}`);
    }
  });

  it("columns with hidden panes: restoring them gives equal columns again", () => {
    const root = chain(panes(4));
    const next = applyLayoutPreset(root, "columns", { hiddenPaneIds: new Set(["p1"]) });
    const rects = paneRects(next);
    for (const r of rects.values()) assert.ok(near(r.w, 0.25));
    // Visible panes first (in order), then the hidden one.
    assert.deepEqual(collectPanes(next).map((p) => p.id), ["p2", "p3", "p4", "p1"]);
  });
});
