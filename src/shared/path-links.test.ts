import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findPathLinks,
  gotoTarget,
  resolveRelativePath,
  vscodeFileUrl,
  type PathLinkMatch,
} from "./path-links.js";

function one(text: string): PathLinkMatch {
  const links = findPathLinks(text);
  assert.equal(
    links.length,
    1,
    `expected one link in ${JSON.stringify(text)}: ${JSON.stringify(links)}`,
  );
  return links[0]!;
}

function linkText(text: string, m: PathLinkMatch): string {
  return text.slice(m.start, m.end);
}

describe("findPathLinks — relative", () => {
  it("parses src/foo.ts:42", () => {
    const text = "error at src/foo.ts:42 here";
    const m = one(text);
    assert.deepEqual(
      { path: m.path, line: m.line, col: m.col, absolute: m.absolute },
      { path: "src/foo.ts", line: 42, col: undefined, absolute: false },
    );
    assert.equal(linkText(text, m), "src/foo.ts:42");
  });

  it("parses ./a/b.tsx:10:5", () => {
    const m = one("./a/b.tsx:10:5");
    assert.equal(m.path, "./a/b.tsx");
    assert.equal(m.line, 10);
    assert.equal(m.col, 5);
  });

  it("parses foo.py(12) and tsc-style foo.ts(3,7):", () => {
    const py = one("  File foo.py(12) failed");
    assert.equal(py.path, "foo.py");
    assert.equal(py.line, 12);
    const text = "src/app.ts(3,7): error TS2304";
    const ts = one(text);
    assert.equal(ts.path, "src/app.ts");
    assert.equal(ts.line, 3);
    assert.equal(ts.col, 7);
    assert.equal(linkText(text, ts), "src/app.ts(3,7)");
  });

  it("accepts plain relative files and ../ paths", () => {
    assert.equal(one("modified:   package.json").path, "package.json");
    assert.equal(one("see ../lib/x").path, "../lib/x");
    assert.equal(one("src\\win\\a.cs:9").path, "src\\win\\a.cs");
  });

  it("strips wrapping punctuation", () => {
    const text = "(see src/a.ts:3).";
    const m = one(text);
    assert.equal(linkText(text, m), "src/a.ts:3");
    assert.equal(one('"src/b.ts",').path, "src/b.ts");
  });

  it("skips words, numbers, and URLs", () => {
    assert.deepEqual(findPathLinks("hello world 1.2.3 v2.0"), []);
    assert.deepEqual(findPathLinks("https://example.com/a/b.ts"), []);
    assert.deepEqual(findPathLinks("key:value.ts"), []);
  });
});

describe("findPathLinks — absolute", () => {
  it("parses line/col on Windows paths", () => {
    const m = one("at C:\\src\\app.ts:12:5");
    assert.equal(m.path, "C:\\src\\app.ts");
    assert.equal(m.line, 12);
    assert.equal(m.col, 5);
    assert.equal(m.absolute, true);
  });

  it("parses POSIX, UNC, and file:// paths", () => {
    const posix = one("/home/me/a.rs:7");
    assert.equal(posix.path, "/home/me/a.rs");
    assert.equal(posix.line, 7);
    assert.equal(one("\\\\srv\\share\\x.txt").path, "\\\\srv\\share\\x.txt");
    const url = one("file:///C:/My%20Dir/a.ts");
    assert.equal(url.path, "C:/My Dir/a.ts");
    assert.equal(url.absolute, true);
  });

  it("keeps absolute paths without a suffix", () => {
    const m = one("D:\\projects\\readme.md.");
    assert.equal(m.path, "D:\\projects\\readme.md");
    assert.equal(m.line, undefined);
  });

  it("finds paths after `=` and `label:` inside a token", () => {
    const text = "--out=C:\\dist\\a.js";
    const out = one(text);
    assert.equal(out.path, "C:\\dist\\a.js");
    assert.equal(linkText(text, out), "C:\\dist\\a.js");
    assert.equal(one("--config=/etc/x.conf:3").path, "/etc/x.conf");
    assert.equal(one("cwd:C:\\proj").path, "C:\\proj");
    assert.equal(one("at:/var/log/x.log").path, "/var/log/x.log");
    assert.equal(one("--file=src/a.ts").path, "src/a.ts");
  });
});

describe("resolveRelativePath", () => {
  it("joins against a Windows cwd", () => {
    assert.equal(resolveRelativePath("D:\\proj", "src/a.ts"), "D:\\proj\\src\\a.ts");
    assert.equal(resolveRelativePath("D:\\proj\\pkg", "../b.ts"), "D:\\proj\\b.ts");
    assert.equal(resolveRelativePath("C:\\", "./x.ts"), "C:\\x.ts");
  });

  it("joins against a POSIX cwd", () => {
    assert.equal(resolveRelativePath("/home/me/proj", "./a/b.tsx"), "/home/me/proj/a/b.tsx");
    assert.equal(resolveRelativePath("/home/me", "../../etc/x.conf"), "/etc/x.conf");
  });

  it("returns null without a usable cwd or above the root", () => {
    assert.equal(resolveRelativePath("", "a.ts"), null);
    assert.equal(resolveRelativePath(undefined, "a.ts"), null);
    assert.equal(resolveRelativePath("relative/dir", "a.ts"), null);
    assert.equal(resolveRelativePath("/", "../a.ts"), null);
  });
});

describe("editor targets", () => {
  it("formats code -g targets", () => {
    assert.equal(gotoTarget("/a.ts"), "/a.ts");
    assert.equal(gotoTarget("/a.ts", 4), "/a.ts:4");
    assert.equal(gotoTarget("/a.ts", 4, 2), "/a.ts:4:2");
  });

  it("builds vscode://file URLs", () => {
    assert.equal(vscodeFileUrl("C:\\My Dir\\a.ts", 3, 1), "vscode://file/C:/My%20Dir/a.ts:3:1");
    assert.equal(vscodeFileUrl("/home/me/#x.ts", 2), "vscode://file/home/me/%23x.ts:2");
  });
});
