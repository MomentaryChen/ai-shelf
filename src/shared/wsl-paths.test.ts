import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWslSnippets,
  convertWslPath,
  convertWslPaths,
  decodeWslListOutput,
  detectWslPathKind,
  parseWslListVerbose,
} from "./wsl-paths.js";

describe("detectWslPathKind", () => {
  it("classifies common forms", () => {
    assert.equal(detectWslPathKind("C:\\Users\\me"), "win-drive");
    assert.equal(detectWslPathKind("c:/Users/me"), "win-drive");
    assert.equal(detectWslPathKind("\\\\wsl$\\Ubuntu\\home\\me"), "win-unc");
    assert.equal(detectWslPathKind("\\\\wsl.localhost\\Debian\\tmp"), "win-unc");
    assert.equal(detectWslPathKind("/mnt/c/Users/me"), "wsl-mnt");
    assert.equal(detectWslPathKind("/home/me"), "linux");
    assert.equal(detectWslPathKind("relative"), "unknown");
  });
});

describe("convertWslPath", () => {
  it("converts Windows drive paths to /mnt", () => {
    const r = convertWslPath("C:\\Users\\me\\proj");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.result, "/mnt/c/Users/me/proj");
      assert.equal(r.direction, "to-wsl");
    }
  });

  it("converts /mnt paths to drive letters", () => {
    const r = convertWslPath("/mnt/d/work/repo");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.result, "D:\\work\\repo");
      assert.equal(r.direction, "to-windows");
    }
  });

  it("converts UNC to Linux and Linux to UNC with distro", () => {
    const toLinux = convertWslPath("\\\\wsl$\\Ubuntu\\home\\me\\src");
    assert.equal(toLinux.ok, true);
    if (toLinux.ok) assert.equal(toLinux.result, "/home/me/src");

    const needs = convertWslPath("/home/me/src", { direction: "to-windows" });
    assert.equal(needs.ok, false);
    if (!needs.ok) assert.equal(needs.reason, "needs-distro");

    const toUnc = convertWslPath("/home/me/src", {
      direction: "to-windows",
      distro: "Ubuntu",
    });
    assert.equal(toUnc.ok, true);
    if (toUnc.ok) assert.equal(toUnc.result, "\\\\wsl$\\Ubuntu\\home\\me\\src");
  });

  it("strips surrounding quotes", () => {
    const r = convertWslPath('"C:\\Temp"');
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.result, "/mnt/c/Temp");
  });

  it("supports forced direction and unc style for /mnt", () => {
    const keep = convertWslPath("/mnt/c/x", { direction: "to-wsl" });
    assert.equal(keep.ok, true);
    if (keep.ok) assert.equal(keep.result, "/mnt/c/x");

    const unc = convertWslPath("/mnt/c/x", {
      direction: "to-windows",
      windowsStyle: "unc",
      distro: "Ubuntu",
    });
    assert.equal(unc.ok, true);
    if (unc.ok) assert.equal(unc.result, "\\\\wsl$\\Ubuntu\\mnt\\c\\x");
  });
});

describe("convertWslPaths", () => {
  it("converts each line and reports errors", () => {
    const { lines, errors } = convertWslPaths("C:\\a\n\nbad\n/mnt/c/b");
    assert.deepEqual(lines, ["/mnt/c/a", "", "bad", "C:\\b"]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.line, 3);
    assert.equal(errors[0]?.reason, "unknown");
  });
});

describe("decodeWslListOutput / parseWslListVerbose", () => {
  it("parses utf8 table with default marker", () => {
    const text = `  NAME            STATE           VERSION
* Ubuntu          Running         2
  Debian          Stopped         2
`;
    const rows = parseWslListVerbose(text);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.name, "Ubuntu");
    assert.equal(rows[0]?.isDefault, true);
    assert.equal(rows[0]?.state, "Running");
    assert.equal(rows[0]?.version, "2");
    assert.equal(rows[1]?.name, "Debian");
    assert.equal(rows[1]?.isDefault, false);
  });

  it("decodes utf16le buffers", () => {
    const utf16 = Buffer.from("  NAME  STATE  VERSION\0*\0 Ubuntu  Running  2\0", "utf16le");
    // Build a realistic UTF-16LE buffer with BOM
    const text = "  NAME              STATE           VERSION\r\n* Ubuntu            Running         2\r\n";
    const bom = Buffer.from([0xff, 0xfe]);
    const body = Buffer.from(text, "utf16le");
    const buf = Buffer.concat([bom, body]);
    const decoded = decodeWslListOutput(buf);
    const rows = parseWslListVerbose(decoded);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, "Ubuntu");
    assert.equal(rows[0]?.isDefault, true);
    void utf16;
  });
});

describe("buildWslSnippets", () => {
  it("emits shell and explorer helpers", () => {
    const snippets = buildWslSnippets({ path: "C:\\proj", distro: "Ubuntu" });
    const ids = snippets.map((s) => s.id);
    assert.ok(ids.includes("shell"));
    assert.ok(ids.includes("explorer"));
    assert.ok(ids.includes("ip"));
    const shell = snippets.find((s) => s.id === "shell");
    assert.match(shell?.command ?? "", /wsl\.exe -d Ubuntu --cd \/mnt\/c\/proj/u);
  });
});
