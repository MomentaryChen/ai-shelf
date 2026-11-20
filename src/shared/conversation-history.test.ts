import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ClaudeFullCollector,
  ClaudeHeadCollector,
  ClaudeSearchCollector,
  claudeLineMayMatter,
  conversationTitle,
  filterByProject,
  groupByProject,
  parseClaudeLine,
  pickResumeCwd,
  searchSnippet,
  searchTerms,
  slashCommandTitle,
  textMatchesTerms,
  type ConversationSummary,
} from "./conversation-history.js";

const base = {
  isSidechain: false,
  cwd: "D:\\work\\demo",
  sessionId: "11111111-2222-3333-4444-555555555555",
  gitBranch: "main",
};

const user = (content: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    parentUuid: null,
    ...base,
    type: "user",
    message: { role: "user", content },
    timestamp: "2026-01-02T03:04:05.000Z",
    ...extra,
  });

const assistant = (content: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    parentUuid: "x",
    ...base,
    message: { role: "assistant", content },
    type: "assistant",
    timestamp: "2026-01-02T03:05:00.000Z",
    ...extra,
  });

const meta = (type: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type, sessionId: base.sessionId, ...extra });

describe("parseClaudeLine", () => {
  it("returns null for malformed or non-object lines", () => {
    assert.equal(parseClaudeLine(""), null);
    assert.equal(parseClaudeLine("not json"), null);
    assert.equal(parseClaudeLine('{"type":"user",'), null);
    assert.equal(parseClaudeLine("[1,2]"), null);
    assert.equal(parseClaudeLine("null"), null);
  });

  it("reads a typed user prompt", () => {
    const info = parseClaudeLine(user("  fix the login bug  "));
    assert.equal(info?.kind, "message");
    if (info?.kind !== "message") return;
    assert.equal(info.role, "user");
    assert.equal(info.text, "fix the login bug");
    assert.equal(info.isPrompt, true);
    assert.equal(info.cwd, base.cwd);
    assert.equal(info.gitBranch, "main");
    assert.equal(info.timestamp, Date.parse("2026-01-02T03:04:05.000Z"));
  });

  it("reads text blocks and drops thinking / tool_use blocks", () => {
    const info = parseClaudeLine(
      assistant([
        { type: "thinking", thinking: "secret" },
        { type: "text", text: "Done." },
        { type: "tool_use", name: "Bash", input: {} },
      ]),
    );
    assert.equal(info?.kind, "message");
    if (info?.kind === "message") {
      assert.equal(info.text, "Done.");
      assert.equal(info.isPrompt, false);
    }
  });

  it("skips tool results, meta, sidechain and injected command entries", () => {
    const skipped = [
      user([{ type: "tool_result", tool_use_id: "t", content: "output" }]),
      user("<local-command-caveat>Caveat</local-command-caveat>", { isMeta: true }),
      user("<command-name>/clear</command-name>"),
      user("<local-command-stdout></local-command-stdout>"),
      user("<system-reminder>x</system-reminder>"),
      user("[Request interrupted by user]"),
      user("sub-agent prompt", { isSidechain: true }),
    ];
    for (const line of skipped) assert.equal(parseClaudeLine(line)?.kind, "other", line);
  });

  it("does not treat api-request-blob records as messages", () => {
    const line = meta("api-request-blob", { message: { role: "user", content: "dup prompt" } });
    assert.equal(parseClaudeLine(line)?.kind, "other");
    assert.equal(claudeLineMayMatter(line), false);
  });

  it("keeps older summary records as a fallback title", () => {
    const info = parseClaudeLine(meta("summary", { summary: "Refactor auth" }));
    assert.deepEqual(info?.kind === "other" ? info.fallbackTitle : null, {
      kind: "summary",
      text: "Refactor auth",
    });
  });

  it("ignores prototype-named record types", () => {
    assert.equal(parseClaudeLine(meta("toString"))?.kind, "other");
  });
});

describe("slashCommandTitle", () => {
  it("builds /name args from a command entry", () => {
    assert.equal(
      slashCommandTitle(
        "<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>PR 12</command-args>",
      ),
      "/review PR 12",
    );
    assert.equal(slashCommandTitle("<command-name>clear</command-name>"), "/clear");
    assert.equal(slashCommandTitle("plain text"), null);
  });
});

describe("ClaudeHeadCollector fallback titles", () => {
  it("prefers ai-title over the starting slash command when no prompt was typed", () => {
    const head = new ClaudeHeadCollector();
    head.add(user("<command-name>/deploy</command-name><command-args>prod</command-args>"));
    assert.equal(head.title, null);
    assert.equal(head.fallbackTitle, "/deploy prod");
    head.add(meta("ai-title", { aiTitle: "Deploy to production" }));
    assert.equal(head.fallbackTitle, "Deploy to production");
    head.add(meta("custom-title", { customTitle: "My deploy" }));
    assert.equal(head.fallbackTitle, "My deploy");
  });
});

describe("ClaudeHeadCollector", () => {
  it("finds title, cwd, start and branch behind bookkeeping records", () => {
    const head = new ClaudeHeadCollector();
    const lines = [
      meta("mode", { mode: "default" }),
      meta("file-history-snapshot", { snapshot: {} }),
      "garbage line {",
      user("<command-name>/model</command-name>"),
      meta("api-request-blob", { message: { role: "user", content: "not me" } }),
      user("Add a dark theme\nwith tokens"),
      assistant([{ type: "text", text: "Sure" }]),
    ];
    for (const l of lines) {
      head.add(l);
      if (head.done) break;
    }
    assert.equal(head.done, true);
    assert.equal(head.title, "Add a dark theme with tokens");
    assert.deepEqual(head.cwds, [base.cwd]);
    assert.equal(head.gitBranch, "main");
    assert.equal(head.startedAt, Date.parse("2026-01-02T03:04:05.000Z"));
  });

  it("accepts prompts given as text-block arrays", () => {
    const head = new ClaudeHeadCollector();
    head.add(user([{ type: "text", text: "array prompt" }]));
    assert.equal(head.title, "array prompt");
  });
});

describe("ClaudeFullCollector", () => {
  it("counts user + assistant messages and caps kept ones", () => {
    const full = new ClaudeFullCollector({ maxMessages: 2, maxMessageChars: 5 });
    for (const l of [
      user("first prompt"),
      assistant([{ type: "thinking", thinking: "x" }]),
      assistant([{ type: "text", text: "ok" }]),
      user([{ type: "tool_result", content: "r" }]),
      user("second"),
      "{broken",
    ]) {
      full.add(l);
    }
    assert.equal(full.messageCount, 3);
    assert.equal(full.messages.length, 2);
    assert.equal(full.messages[0]!.text, "first…");
    assert.equal(full.messages[1]!.role, "assistant");
    assert.equal(full.truncated, true);
  });
});

describe("search helpers", () => {
  it("splits and matches terms case-insensitively (all terms required)", () => {
    assert.deepEqual(searchTerms("  Foo   bar "), ["foo", "bar"]);
    assert.equal(textMatchesTerms("FOO and Bar", ["foo", "bar"]), true);
    assert.equal(textMatchesTerms("foo only", ["foo", "bar"]), false);
    assert.equal(textMatchesTerms("anything", []), false);
  });

  it("makes a one-line snippet around the match", () => {
    const text = `${"a ".repeat(100)}needle\n${"b ".repeat(100)}`;
    const snip = searchSnippet(text, "NEEDLE", 10);
    assert.ok(snip.startsWith("…"));
    assert.ok(snip.endsWith("…"));
    assert.ok(snip.includes("needle"));
    assert.ok(!snip.includes("\n"));
  });

  it("collects the first matching message, skipping non-message lines", () => {
    const col = new ClaudeSearchCollector(searchTerms("deploy"));
    col.add(meta("api-request-blob", { message: { role: "user", content: "deploy" } }));
    col.add(user("hello"));
    col.add(assistant([{ type: "text", text: "Run the Deploy script" }]));
    col.add(user("deploy again"));
    assert.equal(col.matchCount, 2);
    assert.equal(col.role, "assistant");
    assert.equal(col.snippet, "Run the Deploy script");
  });

  it("matches non-ASCII terms", () => {
    const col = new ClaudeSearchCollector(searchTerms("天氣預報"));
    col.add(user("請整理明天的天氣預報資料"));
    assert.equal(col.matchCount, 1);
  });
});

describe("pickResumeCwd", () => {
  it("prefers the cwd that matches the transcript folder", () => {
    assert.deepEqual(
      pickResumeCwd(["D:\\a\\sub", "D:\\a"], (c) => c === "D:\\a"),
      { cwd: "D:\\a", matchesFolder: true },
    );
    assert.deepEqual(
      pickResumeCwd(["x"], () => false),
      { cwd: "x", matchesFolder: false },
    );
    assert.deepEqual(
      pickResumeCwd([], () => true),
      { cwd: null, matchesFolder: false },
    );
  });
});

describe("conversationTitle", () => {
  it("collapses whitespace and caps length", () => {
    assert.equal(conversationTitle("a\n\n b\tc"), "a b c");
    assert.equal(conversationTitle("abcdefghij", 5), "abcd…");
  });
});

describe("groupByProject", () => {
  const s = (id: string, cwd: string | null, updatedAt: number): ConversationSummary => ({
    provider: "claude",
    tool: "claude",
    sessionId: id,
    cwd,
    title: id,
    startedAt: null,
    updatedAt,
    messageCount: null,
    gitBranch: null,
    sizeBytes: 0,
    resumable: true,
  });

  it("groups by cwd (drive paths case-insensitive), newest first", () => {
    const groups = groupByProject([
      s("1", "D:\\work\\a", 10),
      s("2", "d:\\work\\a\\", 30),
      s("3", "/home/me/b", 20),
      s("4", null, 5),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.label, g.sessions.map((x) => x.sessionId)]),
      [
        ["a", ["2", "1"]],
        ["b", ["3"]],
        ["", ["4"]],
      ],
    );
    const key = groups[0]!.key;
    assert.deepEqual(
      filterByProject([s("1", "D:\\work\\a", 1), s("3", "/x", 2)], key).map((x) => x.sessionId),
      ["1"],
    );
    assert.equal(filterByProject([s("1", "/x", 1)], null).length, 1);
  });
});
