import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeLineDiff,
  countLines,
  formatUnifiedDiff,
  MAX_DIFF_LINES,
  splitLines,
  summarizeDiff,
} from "./diff-tools.js";

describe("countLines", () => {
  it("matches splitLines length for common endings", () => {
    const samples = ["", "a", "a\n", "a\nb", "a\r\nb\rc", "\n", "a\r\n"];
    for (const sample of samples) {
      assert.equal(countLines(sample), splitLines(sample).length, sample);
    }
  });

  it("stops once the limit is exceeded", () => {
    const text = Array.from({ length: 50 }, (_, i) => `L${i}`).join("\n");
    assert.equal(countLines(text, 10), 11);
  });
});

describe("splitLines", () => {
  it("returns empty for empty string", () => {
    assert.deepEqual(splitLines(""), []);
  });

  it("splits LF and strips trailing empty from final newline", () => {
    assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
  });

  it("normalizes CRLF and lone CR", () => {
    assert.deepEqual(splitLines("a\r\nb\rc"), ["a", "b", "c"]);
  });

  it("keeps a single empty line when input is just a newline", () => {
    assert.deepEqual(splitLines("\n"), [""]);
  });
});

describe("computeLineDiff", () => {
  it("marks identical texts as identical with equal lines", () => {
    const out = computeLineDiff("a\nb", "a\nb");
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.result.identical, true);
    assert.equal(out.result.added, 0);
    assert.equal(out.result.removed, 0);
    assert.deepEqual(
      out.result.lines.map((l) => l.type),
      ["equal", "equal"],
    );
  });

  it("detects pure additions and removals", () => {
    const added = computeLineDiff("a", "a\nb");
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.equal(added.result.added, 1);
    assert.equal(added.result.removed, 0);

    const removed = computeLineDiff("a\nb", "a");
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(removed.result.added, 0);
    assert.equal(removed.result.removed, 1);
  });

  it("handles replace in the middle", () => {
    const out = computeLineDiff("a\nold\nc", "a\nnew\nc");
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(
      out.result.lines.map((l) => `${l.type}:${l.text}`),
      ["equal:a", "remove:old", "add:new", "equal:c"],
    );
    assert.equal(out.result.lines[1]!.leftNo, 2);
    assert.equal(out.result.lines[1]!.rightNo, null);
    assert.equal(out.result.lines[2]!.leftNo, null);
    assert.equal(out.result.lines[2]!.rightNo, 2);
  });

  it("ignores whitespace when requested", () => {
    const strict = computeLineDiff("  a  ", "a");
    assert.equal(strict.ok, true);
    if (!strict.ok) return;
    assert.equal(strict.result.identical, false);

    const loose = computeLineDiff("  a  ", "a", { ignoreWhitespace: true });
    assert.equal(loose.ok, true);
    if (!loose.ok) return;
    assert.equal(loose.result.identical, true);
    assert.equal(loose.result.lines[0]!.text, "a");
  });

  it("treats both empty as identical", () => {
    const out = computeLineDiff("", "");
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.result.identical, true);
    assert.deepEqual(out.result.lines, []);
  });

  it("rejects oversized inputs", () => {
    const huge = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `L${i}`).join("\n");
    const out = computeLineDiff(huge, "x");
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reason, "tooLarge");
    assert.equal(out.leftLines, MAX_DIFF_LINES + 1);
  });
});

describe("formatUnifiedDiff / summarizeDiff", () => {
  it("formats unified markers", () => {
    const out = computeLineDiff("a\nb", "a\nc");
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(formatUnifiedDiff(out.result.lines), " a\n-b\n+c");
    assert.deepEqual(summarizeDiff(out.result.lines), {
      added: 1,
      removed: 1,
      identical: false,
    });
  });
});
