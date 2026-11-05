import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paintTerminalGrid, terminalFitAction } from "./terminal-fit.js";

const base = {
  proposal: { cols: 120, rows: 40 },
  containerWidth: 960,
  containerHeight: 600,
  currentCols: 80,
  currentRows: 24,
  forceMetrics: false,
};

describe("terminalFitAction", () => {
  it("resizes when the pane has a real size and the grid differs", () => {
    assert.equal(terminalFitAction(base), "resize");
  });

  it("skips a container that has not been laid out", () => {
    assert.equal(terminalFitAction({ ...base, containerWidth: 8, containerHeight: 8 }), "skip");
    assert.equal(terminalFitAction({ ...base, containerWidth: 0, containerHeight: 600 }), "skip");
  });

  it("skips a non-finite proposal", () => {
    assert.equal(
      terminalFitAction({ ...base, proposal: { cols: Number.NaN, rows: 40 } }),
      "skip",
    );
  });

  it("does nothing when the grid already matches", () => {
    assert.equal(
      terminalFitAction({ ...base, currentCols: 120, currentRows: 40 }),
      "skip",
    );
  });

  it("remeasures when the grid matches but cell metrics may be stale", () => {
    assert.equal(
      terminalFitAction({ ...base, currentCols: 120, currentRows: 40, forceMetrics: true }),
      "remeasure",
    );
  });
});

describe("paintTerminalGrid", () => {
  it("clears the renderer before resize so stale rows are not kept", () => {
    const calls: string[] = [];
    const term = {
      cols: 80,
      rows: 24,
      _core: { _renderService: { clear: () => calls.push("clear") } },
      resize(cols: number, rows: number) {
        calls.push(`resize:${cols}x${rows}`);
        this.cols = cols;
        this.rows = rows;
      },
      refresh(start: number, end: number) {
        calls.push(`refresh:${start}-${end}`);
      },
    };
    paintTerminalGrid(term, "resize", 100, 40);
    assert.deepEqual(calls, ["clear", "resize:100x40", "refresh:0-39"]);
  });

  it("skips a degenerate fit", () => {
    let resized = false;
    paintTerminalGrid(
      {
        cols: 80,
        rows: 24,
        resize() {
          resized = true;
        },
        refresh() {},
      },
      "skip",
      2,
      1,
    );
    assert.equal(resized, false);
  });
});
