import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHistoryRows,
  getCommandHistorySource,
  getCommandHistoryVersion,
  isReplayableCommand,
  matchesHistoryQuery,
  registerCommandHistorySource,
  savedCommandNameFor,
  subscribeCommandHistory,
  type CommandHistoryItem,
  type CommandHistorySource,
} from "./command-history";

function item(id: number, command: string, endedAt: number | null, cwd?: string): CommandHistoryItem {
  return { id, command, cwd, exitCode: 0, durationMs: 1, endedAt, canJump: true, hasOutput: true };
}

describe("matchesHistoryQuery", () => {
  it("matches every term in command or cwd, case-insensitively", () => {
    const it1 = { command: "npm run build", cwd: "/home/me/App" };
    assert.equal(matchesHistoryQuery(it1, ""), true);
    assert.equal(matchesHistoryQuery(it1, "BUILD"), true);
    assert.equal(matchesHistoryQuery(it1, "npm app"), true);
    assert.equal(matchesHistoryQuery(it1, "npm test"), false);
  });
});

describe("buildHistoryRows", () => {
  it("merges panes newest first; untimed (replayed) rows go last in pane order", () => {
    const rows = buildHistoryRows(
      [
        { paneId: "p1", sessionId: "s1", items: [item(3, "c", 300), item(2, "b", null), item(1, "a", null)] },
        { paneId: "p2", sessionId: "s2", items: [item(5, "e", 400), item(4, "d", 100)] },
      ],
      "",
    );
    assert.deepEqual(
      rows.map((r) => r.command),
      ["e", "c", "d", "b", "a"],
    );
    assert.equal(rows[0]!.key, "s2:5");
    assert.equal(rows[0]!.paneId, "p2");
  });

  it("filters, applies the fallback cwd, and limits", () => {
    const groups = [
      {
        paneId: "p1",
        sessionId: "s1",
        fallbackCwd: "/repo",
        items: [item(3, "git push", 3), item(2, "ls", 2, "/tmp"), item(1, "git status", 1)],
      },
    ];
    const rows = buildHistoryRows(groups, "git");
    assert.deepEqual(
      rows.map((r) => [r.command, r.cwd]),
      [
        ["git push", "/repo"],
        ["git status", "/repo"],
      ],
    );
    assert.equal(buildHistoryRows(groups, "repo").length, 2);
    assert.equal(buildHistoryRows(groups, "", 1).length, 1);
  });
});

describe("isReplayableCommand", () => {
  it("allows single-line commands only", () => {
    assert.equal(isReplayableCommand("git status"), true);
    assert.equal(isReplayableCommand("for i in 1 2\n> do echo $i\n> done"), false);
    assert.equal(isReplayableCommand("a\r\nb"), false);
    assert.equal(isReplayableCommand("   "), false);
  });
});

describe("savedCommandNameFor", () => {
  it("uses the first line and caps the length", () => {
    assert.equal(savedCommandNameFor("  make test \nmore"), "make test");
    assert.equal(savedCommandNameFor("abcdefghij", 5), "abcd…");
  });
});

describe("command history registry", () => {
  it("registers per session and notifies listeners", () => {
    const src: CommandHistorySource = { list: () => [], jump: () => true, outputText: () => null };
    let calls = 0;
    const off = subscribeCommandHistory(() => calls++);
    const v0 = getCommandHistoryVersion();
    const unregister = registerCommandHistorySource("s1", src);
    assert.equal(getCommandHistorySource("s1"), src);
    unregister();
    assert.equal(getCommandHistorySource("s1"), undefined);
    assert.equal(calls, 2);
    assert.equal(getCommandHistoryVersion(), v0 + 2);
    off();
  });

  it("a stale unregister does not remove a newer source", () => {
    const a: CommandHistorySource = { list: () => [], jump: () => true, outputText: () => null };
    const b: CommandHistorySource = { list: () => [], jump: () => true, outputText: () => null };
    const offA = registerCommandHistorySource("s2", a);
    const offB = registerCommandHistorySource("s2", b);
    offA();
    assert.equal(getCommandHistorySource("s2"), b);
    offB();
  });
});
