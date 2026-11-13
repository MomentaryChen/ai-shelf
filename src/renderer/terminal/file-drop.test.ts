import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDroppedPaths, isOsFileDrag, quotePathForShell } from "./file-drop.js";

describe("isOsFileDrag", () => {
  it("accepts plain OS file drags", () => {
    assert.equal(isOsFileDrag(["Files"]), true);
    assert.equal(isOsFileDrag(["text/uri-list", "Files"]), true);
  });

  it("ignores our own pane / profile drags and non-file drags", () => {
    assert.equal(isOsFileDrag(["application/x-ai-shelf-profile-pane", "text/plain"]), false);
    assert.equal(isOsFileDrag(["Files", "application/x-ai-shelf-profile-pane"]), false);
    assert.equal(isOsFileDrag(["text/plain"]), false);
    assert.equal(isOsFileDrag([]), false);
  });
});

describe("quotePathForShell", () => {
  it("leaves plain paths alone", () => {
    assert.equal(quotePathForShell("C:\\src\\app.ts"), "C:\\src\\app.ts");
    assert.equal(quotePathForShell("/home/me/app.ts"), "/home/me/app.ts");
  });

  it("double-quotes Windows paths with spaces or shell characters", () => {
    assert.equal(quotePathForShell("C:\\Program Files\\x.txt"), '"C:\\Program Files\\x.txt"');
    assert.equal(quotePathForShell("D:\\a&b\\c.txt"), '"D:\\a&b\\c.txt"');
    assert.equal(quotePathForShell("\\\\server\\share\\my file"), '"\\\\server\\share\\my file"');
  });

  it("single-quotes POSIX paths and escapes embedded single quotes", () => {
    assert.equal(quotePathForShell("/Users/me/My Docs/a.md"), "'/Users/me/My Docs/a.md'");
    assert.equal(quotePathForShell("/tmp/it's"), "'/tmp/it'\\''s'");
    assert.equal(quotePathForShell("/tmp/$HOME"), "'/tmp/$HOME'");
  });
});

describe("formatDroppedPaths", () => {
  it("joins several paths with spaces", () => {
    assert.equal(
      formatDroppedPaths(["C:\\a.txt", "C:\\My Files\\b.txt", ""]),
      'C:\\a.txt "C:\\My Files\\b.txt"',
    );
  });
});
