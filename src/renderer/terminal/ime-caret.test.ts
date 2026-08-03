import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findCaretCell, type ImeCaretViewport } from "./ime-caret.js";

/**
 * Build a viewport from ASCII rows where `#` marks an inverse cell and any
 * other character marks a normal one. Rows are padded to equal width so
 * `line.length` matches a real terminal row.
 */
function viewport(...rows: string[]): ImeCaretViewport {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const padded = rows.map((r) => r.padEnd(width, " "));
  return {
    rows: padded.length,
    getLine(row) {
      const text = padded[row];
      if (text === undefined) return undefined;
      return {
        length: width,
        getCell(x) {
          if (x < 0 || x >= width) return undefined;
          return { isInverse: () => (text[x] === "#" ? 1 : 0) };
        },
      };
    },
  };
}

describe("findCaretCell", () => {
  it("finds a lone inverse cell", () => {
    assert.deepEqual(findCaretCell(viewport("  > hi#      ")), { col: 6, row: 0 });
  });

  it("returns null when nothing is inverse", () => {
    assert.equal(findCaretCell(viewport("  > hi ", "       ")), null);
  });

  it("prefers the bottom-most caret", () => {
    assert.deepEqual(findCaretCell(viewport("a#   ", "     ", "b#   ")), { col: 1, row: 2 });
  });

  // A caret over a full-width glyph spans two cells. (In this fixture each
  // character is one cell, so the run is written out as `##`.)
  it("accepts a two-cell caret", () => {
    assert.deepEqual(findCaretCell(viewport("> 你好##  ")), { col: 4, row: 0 });
  });

  // Regression: a highlighted menu row below the prompt used to win, because
  // the scan ran bottom-up/right-to-left and took the first inverse cell.
  it("ignores a highlighted row below the caret", () => {
    const view = viewport(
      "> hi#        ", // real caret
      "  /clear     ",
      "  ##########_", // selected autocomplete row
    );
    assert.deepEqual(findCaretCell(view), { col: 4, row: 0 });
  });

  // Regression: the right end of a selection bar has no inverse neighbour to
  // its right, so a "both neighbours inverse" check treated it as a caret.
  it("ignores a highlighted row that runs to the right edge", () => {
    const view = viewport(
      "> hi#     ", // real caret
      "##########", // full-width selection bar
    );
    assert.deepEqual(findCaretCell(view), { col: 4, row: 0 });
  });

  it("still finds a caret on a row that also holds a selection bar", () => {
    const view = viewport("#### > hi#  ");
    assert.deepEqual(findCaretCell(view), { col: 9, row: 0 });
  });

  it("honours a custom max run length", () => {
    const view = viewport("> ###   ");
    assert.equal(findCaretCell(view, 2), null);
    assert.deepEqual(findCaretCell(view, 3), { col: 2, row: 0 });
  });
});
