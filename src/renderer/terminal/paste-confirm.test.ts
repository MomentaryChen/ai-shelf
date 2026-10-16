import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzePaste,
  buildPastePreview,
  getPasteConfirmReasons,
  normalizePasteConfirmMaxChars,
  normalizePasteConfirmMaxLines,
  shouldConfirmPaste,
  toSingleLinePaste,
  type PasteConfirmSettings,
} from "./paste-confirm.js";

function settings(partial: Partial<PasteConfirmSettings> = {}): PasteConfirmSettings {
  return { enabled: true, maxLines: 5, maxChars: 100, alwaysWhenBroadcast: true, ...partial };
}

describe("analyzePaste", () => {
  it("returns zeros for empty text", () => {
    assert.deepEqual(analyzePaste(""), { lines: 0, chars: 0, hasNewline: false });
  });

  it("counts a single line", () => {
    assert.deepEqual(analyzePaste("echo hi"), { lines: 1, chars: 7, hasNewline: false });
  });

  it("does not count a single trailing newline as an extra line", () => {
    assert.equal(analyzePaste("a\nb\n").lines, 2);
    assert.equal(analyzePaste("a\n").lines, 1);
    assert.equal(analyzePaste("a\n").hasNewline, true);
  });

  it("treats CRLF and lone CR as one newline", () => {
    const s = analyzePaste("a\r\nb\rc");
    assert.equal(s.lines, 3);
    assert.equal(s.chars, 5);
  });

  it("counts code points, not UTF-16 units", () => {
    assert.equal(analyzePaste("中文😀").chars, 3);
  });
});

describe("getPasteConfirmReasons", () => {
  it("passes small single-pane pastes through", () => {
    assert.deepEqual(getPasteConfirmReasons(analyzePaste("ls -la"), 1, settings()), []);
  });

  it("flags line count over the threshold", () => {
    const text = "1\n2\n3\n4\n5\n6";
    assert.deepEqual(getPasteConfirmReasons(analyzePaste(text), 1, settings()), ["lines"]);
    assert.deepEqual(
      getPasteConfirmReasons(analyzePaste("1\n2\n3\n4\n5\n"), 1, settings()),
      [],
    );
  });

  it("maxLines 1 confirms any multi-line paste", () => {
    assert.deepEqual(
      getPasteConfirmReasons(analyzePaste("a\nb"), 1, settings({ maxLines: 1 })),
      ["lines"],
    );
  });

  it("flags size over the threshold", () => {
    assert.deepEqual(getPasteConfirmReasons(analyzePaste("x".repeat(101)), 1, settings()), [
      "size",
    ]);
    assert.deepEqual(getPasteConfirmReasons(analyzePaste("x".repeat(100)), 1, settings()), []);
  });

  it("reports every reason that applies", () => {
    const text = Array.from({ length: 10 }, () => "y".repeat(20)).join("\n");
    assert.deepEqual(getPasteConfirmReasons(analyzePaste(text), 3, settings()), [
      "lines",
      "size",
      "broadcast",
    ]);
  });

  it("confirms any broadcast paste when alwaysWhenBroadcast is on", () => {
    assert.deepEqual(getPasteConfirmReasons(analyzePaste("ls"), 2, settings()), ["broadcast"]);
    assert.deepEqual(
      getPasteConfirmReasons(analyzePaste("ls"), 2, settings({ alwaysWhenBroadcast: false })),
      [],
    );
  });

  it("keeps the broadcast check when threshold confirmation is disabled", () => {
    const off = settings({ enabled: false });
    assert.deepEqual(getPasteConfirmReasons(analyzePaste("x".repeat(500)), 1, off), []);
    assert.deepEqual(getPasteConfirmReasons(analyzePaste("ls"), 4, off), ["broadcast"]);
  });

  it("never confirms an empty paste", () => {
    assert.deepEqual(getPasteConfirmReasons(analyzePaste(""), 5, settings()), []);
  });
});

describe("shouldConfirmPaste", () => {
  it("combines analyze + reasons", () => {
    assert.equal(shouldConfirmPaste("ls", 1, settings()), false);
    assert.equal(shouldConfirmPaste("ls", 2, settings()), true);
  });
});

describe("toSingleLinePaste", () => {
  it("joins lines with spaces and drops blanks", () => {
    assert.equal(toSingleLinePaste("git add .\n\n  git commit -m x\n"), "git add . git commit -m x");
  });

  it("strips sh, PowerShell and cmd line continuations", () => {
    assert.equal(toSingleLinePaste("docker run \\\n  -it \\\n  img"), "docker run -it img");
    assert.equal(toSingleLinePaste("Get-Item `\r\n  -Path x"), "Get-Item -Path x");
    assert.equal(toSingleLinePaste("dir ^\r\n /b"), "dir /b");
  });

  it("leaves single-line text unchanged except trimming", () => {
    assert.equal(toSingleLinePaste("  echo hi  "), "echo hi");
  });
});

describe("buildPastePreview", () => {
  it("returns the whole text when short", () => {
    assert.deepEqual(buildPastePreview("a\nb\n", 5, 100), { text: "a\nb", truncated: false });
  });

  it("truncates by lines", () => {
    assert.deepEqual(buildPastePreview("1\n2\n3\n4", 2, 100), { text: "1\n2", truncated: true });
  });

  it("truncates by code points", () => {
    assert.deepEqual(buildPastePreview("😀😀😀", 5, 2), { text: "😀😀", truncated: true });
  });

  it("reveals control characters such as ESC", () => {
    assert.equal(buildPastePreview("a\x1b[201~b\x7f").text, "a␛[201~b␡");
  });

  it("keeps tabs and newlines as-is", () => {
    assert.equal(buildPastePreview("a\tb\r\nc").text, "a\tb\nc");
  });
});

describe("threshold normalization", () => {
  it("clamps and defaults line threshold", () => {
    assert.equal(normalizePasteConfirmMaxLines(undefined), 5);
    assert.equal(normalizePasteConfirmMaxLines(0), 1);
    assert.equal(normalizePasteConfirmMaxLines("12"), 12);
  });

  it("clamps and defaults char threshold", () => {
    assert.equal(normalizePasteConfirmMaxChars("abc"), 2048);
    assert.equal(normalizePasteConfirmMaxChars(1), 64);
    assert.equal(normalizePasteConfirmMaxChars(4096.4), 4096);
  });
});
