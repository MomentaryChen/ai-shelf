import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { encodeClaudeProjectDir } from "../shared/agent-session-resume.js";
import { ClaudeConversationProvider } from "./conversation-history-providers.js";
import { readJsonlLines } from "./jsonl-line-reader.js";

const root = mkdtempSync(join(tmpdir(), "ai-shelf-conv-"));
after(() => rmSync(root, { recursive: true, force: true }));

async function collect(
  path: string,
  opts?: Parameters<typeof readJsonlLines>[1],
): Promise<string[]> {
  const out: string[] = [];
  for await (const line of readJsonlLines(path, opts)) out.push(line);
  return out;
}

describe("readJsonlLines", () => {
  it("splits lines across small chunks, keeps UTF-8 intact and the last unterminated line", async () => {
    const p = join(root, "a.jsonl");
    writeFileSync(p, "one\n天氣預報\n\nlast");
    assert.deepEqual(await collect(p, { chunkBytes: 3 }), ["one", "天氣預報", "last"]);
  });

  it("drops oversized lines without breaking the following ones", async () => {
    const p = join(root, "b.jsonl");
    writeFileSync(p, `short\n${"x".repeat(50)}\nafter\n`);
    assert.deepEqual(await collect(p, { chunkBytes: 8, maxLineBytes: 10 }), ["short", "after"]);
  });

  it("stops at maxBytes and yields nothing for missing files", async () => {
    const p = join(root, "c.jsonl");
    writeFileSync(p, "aaaa\nbbbb\ncccc\n");
    assert.deepEqual(await collect(p, { maxBytes: 7 }), ["aaaa"]);
    assert.deepEqual(await collect(join(root, "missing.jsonl")), []);
  });
});

describe("ClaudeConversationProvider", () => {
  const configDir = join(root, "claude");
  const projectCwd = join(root, "proj");
  mkdirSync(projectCwd, { recursive: true });
  const folder = join(configDir, "projects", encodeClaudeProjectDir(projectCwd));
  mkdirSync(folder, { recursive: true });

  const idA = "aaaaaaaa-0000-4000-8000-000000000001";
  const idB = "bbbbbbbb-0000-4000-8000-000000000002";
  const rec = (type: "user" | "assistant", content: unknown, ts: string) =>
    JSON.stringify({
      parentUuid: null,
      isSidechain: false,
      type,
      message: { role: type, content },
      timestamp: ts,
      cwd: projectCwd,
      sessionId: idA,
      gitBranch: "feat/x",
    });

  writeFileSync(
    join(folder, `${idA}.jsonl`),
    [
      JSON.stringify({ type: "mode", mode: "default" }),
      rec("user", "Fix the flaky upload test", "2026-01-01T00:00:00Z"),
      rec(
        "assistant",
        [{ type: "text", text: "Looking at uploader retries." }],
        "2026-01-01T00:01:00Z",
      ),
      "{not json",
      rec("user", [{ type: "tool_result", content: "ok" }], "2026-01-01T00:02:00Z"),
    ].join("\n") + "\n",
  );
  writeFileSync(join(folder, `${idB}.jsonl`), `${JSON.stringify({ type: "mode" })}\n`);
  writeFileSync(
    join(folder, "not-a-session.jsonl"),
    rec("user", "ignored", "2026-01-01T00:00:00Z"),
  );
  utimesSync(join(folder, `${idA}.jsonl`), new Date("2026-02-01"), new Date("2026-02-01"));

  const provider = new ClaudeConversationProvider(() => configDir);

  it("lists sessions with head metadata and skips empty / non-uuid files", async () => {
    const list = await provider.listSessions();
    assert.equal(list.length, 1);
    const s = list[0]!;
    assert.equal(s.sessionId, idA);
    assert.equal(s.title, "Fix the flaky upload test");
    assert.equal(s.cwd, projectCwd);
    assert.equal(s.gitBranch, "feat/x");
    assert.equal(s.startedAt, Date.parse("2026-01-01T00:00:00Z"));
    assert.equal(s.messageCount, null);
    assert.equal(s.resumable, true);
  });

  it("reads messages and then reports the count in the list", async () => {
    const detail = await provider.readSession(idA);
    assert.ok(detail);
    assert.equal(detail.messages.length, 2);
    assert.equal(detail.summary.messageCount, 2);
    assert.equal((await provider.listSessions())[0]!.messageCount, 2);
    assert.equal(await provider.readSession("../../etc/passwd"), null);
  });

  it("searches message text and stops when cancelled", async () => {
    const r = await provider.searchSessions("uploader RETRIES", {
      limit: 10,
      shouldStop: () => false,
    });
    assert.equal(r.hits.length, 1);
    assert.equal(r.hits[0]!.role, "assistant");
    const none = await provider.searchSessions("nothing-here", {
      limit: 10,
      shouldStop: () => false,
    });
    assert.equal(none.hits.length, 0);
    const stopped = await provider.searchSessions("upload", { limit: 10, shouldStop: () => true });
    assert.equal(stopped.cancelled, true);
  });
});
