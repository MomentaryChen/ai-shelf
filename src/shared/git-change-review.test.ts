import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideRevertAction,
  isObjectId,
  isSafeRepoPath,
  parseDiffTreeRaw,
  parseLsTreeEntry,
  parseUnifiedDiff,
  truncateDiff,
} from "./git-change-review.js";

const Z = "0".repeat(40);
const A = "a".repeat(40);
const B = "b".repeat(40);

test("parseDiffTreeRaw reads A / M / D / T and flags gitlinks", () => {
  const out = [
    `:000000 100644 ${Z} ${A} A`,
    "src/new file.ts",
    `:100644 000000 ${A} ${Z} D`,
    "gone.txt",
    `:100644 100644 ${A} ${B} M`,
    "b/changed.ts",
    `:100644 120000 ${A} ${B} T`,
    "link",
    `:160000 160000 ${A} ${B} M`,
    "vendor/sub",
    "",
  ].join("\0");
  assert.deepEqual(parseDiffTreeRaw(out), [
    { path: "b/changed.ts", status: "M", gitlink: false },
    { path: "gone.txt", status: "D", gitlink: false },
    { path: "link", status: "M", gitlink: false },
    { path: "src/new file.ts", status: "A", gitlink: false },
    { path: "vendor/sub", status: "M", gitlink: true },
  ]);
});

test("parseDiffTreeRaw handles empty output", () => {
  assert.deepEqual(parseDiffTreeRaw(""), []);
  assert.deepEqual(parseDiffTreeRaw("\n"), []);
});

test("parseLsTreeEntry finds the exact path only", () => {
  const out = `100644 blob ${A}\tsrc/a.ts\u0000160000 commit ${B}\tvendor/sub\u0000`;
  assert.deepEqual(parseLsTreeEntry(out, "src/a.ts"), { mode: "100644", type: "blob" });
  assert.deepEqual(parseLsTreeEntry(out, "vendor/sub"), { mode: "160000", type: "commit" });
  assert.equal(parseLsTreeEntry(out, "src"), null);
  assert.equal(parseLsTreeEntry("", "src/a.ts"), null);
});

test("decideRevertAction", () => {
  const mod = { path: "a", status: "M" as const, gitlink: false };
  const add = { path: "a", status: "A" as const, gitlink: false };
  const blob = { mode: "100644", type: "blob" };
  assert.deepEqual(decideRevertAction(null, blob), { kind: "refuse", code: "not-changed" });
  assert.deepEqual(decideRevertAction(mod, blob), { kind: "restore" });
  assert.deepEqual(decideRevertAction({ ...mod, status: "D" }, blob), { kind: "restore" });
  assert.deepEqual(decideRevertAction(add, null), { kind: "delete" });
  assert.deepEqual(decideRevertAction({ ...mod, gitlink: true }, blob), {
    kind: "refuse",
    code: "gitlink",
  });
  assert.deepEqual(decideRevertAction(add, { mode: "160000", type: "commit" }), {
    kind: "refuse",
    code: "gitlink",
  });
});

test("isSafeRepoPath rejects escapes and option-looking paths", () => {
  for (const ok of ["a.txt", "src/app/[id]/page.tsx", "dir/file name.md", ".github/x.yml"]) {
    assert.equal(isSafeRepoPath(ok), true, ok);
  }
  for (const bad of [
    "",
    "-rf",
    "/etc/passwd",
    "\\\\server\\share",
    "C:/x",
    "c:x",
    "../x",
    "a/../b",
    "a/./b",
    "a//b",
    "a\0b",
    "a\nb",
    42,
    null,
  ]) {
    assert.equal(isSafeRepoPath(bad), false, String(bad));
  }
});

test("isObjectId", () => {
  assert.equal(isObjectId(A), true);
  assert.equal(isObjectId("c".repeat(64)), true);
  assert.equal(isObjectId("HEAD"), false);
  assert.equal(isObjectId(A.toUpperCase()), false);
  assert.equal(isObjectId(undefined), false);
});

test("parseUnifiedDiff numbers lines and skips the header", () => {
  const diff = [
    "diff --git a/f.txt b/f.txt",
    "index 8000c89..753c3da 100644",
    "--- a/f.txt",
    "+++ b/f.txt",
    "@@ -1,3 +1,3 @@ fn()",
    " keep",
    "-old",
    "+new",
    " tail",
    "\\ No newline at end of file",
    "",
  ].join("\n");
  const p = parseUnifiedDiff(diff);
  assert.equal(p.binary, false);
  assert.equal(p.added, 1);
  assert.equal(p.removed, 1);
  assert.deepEqual(
    p.lines.map((l) => [l.type, l.text, l.oldNo, l.newNo]),
    [
      ["hunk", "@@ -1,3 +1,3 @@ fn()", null, null],
      ["context", "keep", 1, 1],
      ["remove", "old", 2, null],
      ["add", "new", null, 2],
      ["context", "tail", 3, 3],
      ["note", "\\ No newline at end of file", null, null],
    ],
  );
});

test("parseUnifiedDiff detects binary files and CRLF", () => {
  const bin = parseUnifiedDiff(
    "diff --git a/x.png b/x.png\nindex 1..2 100644\nBinary files a/x.png and b/x.png differ\n",
  );
  assert.equal(bin.binary, true);
  assert.equal(bin.lines.length, 0);
  const crlf = parseUnifiedDiff("@@ -0,0 +1 @@\r\n+hi\r\n");
  assert.deepEqual(crlf.lines[1], { type: "add", text: "hi", oldNo: null, newNo: 1 });
  assert.deepEqual(parseUnifiedDiff(""), { binary: false, lines: [], added: 0, removed: 0 });
});

test("truncateDiff cuts at a line boundary", () => {
  assert.deepEqual(truncateDiff("a\nb\nc\n", 10), { diff: "a\nb\nc\n", truncated: false });
  assert.deepEqual(truncateDiff("a\nb\nc\n", 2), { diff: "a\nb\n", truncated: true });
});
