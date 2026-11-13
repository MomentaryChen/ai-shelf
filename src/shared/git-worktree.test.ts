import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGitCwd,
  deriveWorktreePath,
  isSafeRefArg,
  mainWorktreeRoot,
  normalizeGitPath,
  parsePorcelainDirty,
  parseRevParseProbe,
  resolveGitPath,
  sanitizeBranchForPath,
  toNativeDisplayPath,
} from "./git-worktree.js";

describe("classifyGitCwd", () => {
  it("runs Windows git for drive paths", () => {
    assert.deepEqual(classifyGitCwd("C:\\src\\app", "win32"), {
      kind: "native",
      path: "C:\\src\\app",
    });
  });

  it("routes WSL UNC paths through the distro", () => {
    assert.deepEqual(classifyGitCwd("\\\\wsl.localhost\\Ubuntu-22.04\\home\\me\\repo", "win32"), {
      kind: "wsl",
      distro: "Ubuntu-22.04",
      linuxPath: "/home/me/repo",
    });
    assert.deepEqual(classifyGitCwd("\\\\wsl$\\Debian", "win32"), {
      kind: "wsl",
      distro: "Debian",
      linuxPath: "/",
    });
  });

  it("skips other UNC shapes and rootless Linux paths on Windows", () => {
    // A WSL bash OSC 7 report (`file://host/home/me`) parses to this on Windows.
    assert.equal(classifyGitCwd("\\\\my-linux-host\\home\\me", "win32"), null);
    assert.equal(classifyGitCwd("\\\\server\\share\\repo", "win32"), null);
    assert.equal(classifyGitCwd("/home/me/repo", "win32"), null);
    assert.equal(classifyGitCwd("\\\\wsl$\\bad name\\x", "win32"), null);
    assert.equal(classifyGitCwd("", "win32"), null);
  });

  it("uses POSIX paths on Unix hosts", () => {
    assert.deepEqual(classifyGitCwd("/home/me/repo", "linux"), {
      kind: "native",
      path: "/home/me/repo",
    });
    assert.equal(classifyGitCwd("relative/dir", "darwin"), null);
  });
});

describe("normalizeGitPath / resolveGitPath", () => {
  it("normalizes separators and dot segments", () => {
    assert.equal(normalizeGitPath("c:\\a\\b\\..\\c\\"), "C:/a/c");
    assert.equal(normalizeGitPath("/a/./b/../c"), "/a/c");
    assert.equal(normalizeGitPath("C:/"), "C:/");
  });

  it("resolves relative git output against the cwd", () => {
    assert.equal(resolveGitPath("C:\\repo\\src", "../.git"), "C:/repo/.git");
    assert.equal(resolveGitPath("/repo", ".git"), "/repo/.git");
    assert.equal(resolveGitPath("/repo/sub", "/other/.git"), "/other/.git");
  });
});

describe("parseRevParseProbe", () => {
  it("detects the main checkout", () => {
    const probe = parseRevParseProbe("C:/src/app\n.git\n.git\n", "C:\\src\\app");
    assert.ok(probe);
    assert.equal(probe.isLinkedWorktree, false);
    assert.equal(probe.mainRoot, "C:/src/app");
    assert.equal(probe.toplevel, "C:/src/app");
  });

  it("detects a main-checkout subdirectory with absolute git dirs", () => {
    const probe = parseRevParseProbe(
      "/home/me/app\n/home/me/app/.git\n/home/me/app/.git\n",
      "/home/me/app/src",
    );
    assert.ok(probe);
    assert.equal(probe.isLinkedWorktree, false);
    assert.equal(probe.mainRoot, "/home/me/app");
  });

  it("detects a linked worktree and finds the main root", () => {
    const probe = parseRevParseProbe(
      "C:/src/app-feat\nC:/src/app/.git/worktrees/app-feat\nC:/src/app/.git\n",
      "C:\\src\\app-feat",
    );
    assert.ok(probe);
    assert.equal(probe.isLinkedWorktree, true);
    assert.equal(probe.toplevel, "C:/src/app-feat");
    assert.equal(probe.mainRoot, "C:/src/app");
  });

  it("compares Windows paths case-insensitively", () => {
    const probe = parseRevParseProbe(
      "C:/src/app\nc:/SRC/app/.git\nC:/src/app/.git\n",
      "C:\\src\\app",
    );
    assert.equal(probe?.isLinkedWorktree, false);
  });

  it("rejects short output", () => {
    assert.equal(parseRevParseProbe("C:/src/app\n", "C:\\src\\app"), null);
  });
});

describe("mainWorktreeRoot", () => {
  it("uses the bare repo dir when there is no .git folder", () => {
    assert.equal(mainWorktreeRoot("/srv/app.git", "/srv/app-wt"), "/srv/app.git");
  });
});

describe("sanitizeBranchForPath", () => {
  it("flattens slashes and unsafe characters", () => {
    assert.equal(sanitizeBranchForPath("feat/login ui"), "feat-login-ui");
    assert.equal(sanitizeBranchForPath("fix:a*b?c"), "fix-a-b-c");
    assert.equal(sanitizeBranchForPath("--weird//name.."), "weird-name");
    assert.equal(sanitizeBranchForPath("///"), "worktree");
  });
});

describe("deriveWorktreePath", () => {
  it("places the worktree next to the main checkout (Windows)", () => {
    assert.equal(deriveWorktreePath("C:/src/ai-shelf", "feat/git"), "C:\\src\\ai-shelf-feat-git");
  });

  it("places the worktree next to the main checkout (POSIX)", () => {
    assert.equal(deriveWorktreePath("/home/me/app/", "fix-1"), "/home/me/app-fix-1");
  });

  it("handles a repo at the filesystem root and bare repos", () => {
    assert.equal(deriveWorktreePath("C:/app", "x"), "C:\\app-x");
    assert.equal(deriveWorktreePath("/srv/app.git", "x"), "/srv/app-x");
  });
});

describe("toNativeDisplayPath", () => {
  it("restores backslashes for Windows paths only", () => {
    assert.equal(toNativeDisplayPath("C:/src/app"), "C:\\src\\app");
    assert.equal(toNativeDisplayPath("/home/me"), "/home/me");
  });
});

describe("parsePorcelainDirty", () => {
  it("is dirty when any entry is listed", () => {
    assert.equal(parsePorcelainDirty(""), false);
    assert.equal(parsePorcelainDirty("\n"), false);
    assert.equal(parsePorcelainDirty(" M src/a.ts\n"), true);
  });
});

describe("isSafeRefArg", () => {
  it("rejects option-like and whitespace refs", () => {
    assert.equal(isSafeRefArg("feat/x"), true);
    assert.equal(isSafeRefArg("-b"), false);
    assert.equal(isSafeRefArg("--force"), false);
    assert.equal(isSafeRefArg("a b"), false);
    assert.equal(isSafeRefArg(""), false);
    assert.equal(isSafeRefArg(" x"), false);
  });
});
