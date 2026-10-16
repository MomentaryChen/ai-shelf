import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { LocalUsageNotFoundError } from "../local-sqlite.js";
import { fetchOpencodeUsage, opencodeDataDir, parseOpencodeMessage } from "./opencode.js";

const tmpRoots: string[] = [];
const savedXdg = process.env["XDG_DATA_HOME"];
after(() => {
  if (savedXdg === undefined) delete process.env["XDG_DATA_HOME"];
  else process.env["XDG_DATA_HOME"] = savedXdg;
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

function tempXdg(): string {
  const dir = mkdtempSync(join(tmpdir(), "usage-opencode-"));
  tmpRoots.push(dir);
  process.env["XDG_DATA_HOME"] = dir;
  return join(dir, "opencode");
}

const assistant = (created: number, extra: Record<string, unknown> = {}) => ({
  role: "assistant",
  modelID: "claude-sonnet-4-5",
  providerID: "anthropic",
  cost: 0.012,
  time: { created, completed: created + 500 },
  tokens: { input: 100, output: 40, reasoning: 10, cache: { read: 300, write: 20 } },
  ...extra,
});

describe("opencodeDataDir", () => {
  it("prefers XDG_DATA_HOME, else ~/.local/share on every platform", () => {
    assert.equal(opencodeDataDir({ XDG_DATA_HOME: "/x" }, "/home/u"), join("/x", "opencode"));
    assert.equal(opencodeDataDir({}, "/home/u"), join("/home/u", ".local", "share", "opencode"));
  });
});

describe("parseOpencodeMessage", () => {
  it("counts cache tokens as input and reasoning as output", () => {
    const rec = parseOpencodeMessage(assistant(1_760_000_000_000));
    assert.deepEqual(rec, {
      timestampMs: 1_760_000_000_000,
      costUsd: 0.012,
      inputTokens: 420,
      outputTokens: 50,
      model: "claude-sonnet-4-5",
    });
  });

  it("ignores user messages and malformed input", () => {
    assert.equal(parseOpencodeMessage({ role: "user", time: { created: 1 } }), null);
    assert.equal(parseOpencodeMessage(null), null);
    assert.equal(parseOpencodeMessage("text"), null);
  });

  it("tolerates missing token fields and falls back to the row timestamp", () => {
    const rec = parseOpencodeMessage({ role: "assistant" }, 1_760_000_000_000);
    assert.deepEqual(rec, {
      timestampMs: 1_760_000_000_000,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      model: undefined,
    });
  });
});

describe("fetchOpencodeUsage", () => {
  it("reads assistant messages from opencode.db", async () => {
    const dir = tempXdg();
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(join(dir, "opencode.db"));
    db.exec(
      "CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)",
    );
    const now = Date.now() - 60_000;
    const insert = db.prepare("INSERT INTO message VALUES (?, 's1', ?, ?, ?)");
    insert.run("m1", now, now, JSON.stringify(assistant(now)));
    insert.run("m2", now, now, JSON.stringify({ role: "user", time: { created: now } }));
    insert.run("m3", now, now, "{not json");
    const old = now - 120 * 86_400_000;
    insert.run("m4", old, old, JSON.stringify(assistant(old)));
    db.close();

    const result = await fetchOpencodeUsage(30);
    assert.equal(result.totalInputTokens, 420);
    assert.equal(result.totalOutputTokens, 50);
    assert.equal(result.totalCostUsd, 0.012);
    assert.equal(result.daily.length, 1);
    assert.equal(result.byModel?.[0]?.model, "claude-sonnet-4-5");
  });

  it("falls back to legacy storage/message JSON files", async () => {
    const dir = tempXdg();
    const sessionDir = join(dir, "storage", "message", "ses_1");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "msg_1.json"), JSON.stringify(assistant(Date.now() - 60_000)));
    writeFileSync(join(sessionDir, "msg_2.json"), "{broken");

    const result = await fetchOpencodeUsage(7);
    assert.equal(result.totalInputTokens, 420);
  });

  it("reports not-found when OpenCode has never run", async () => {
    tempXdg();
    await assert.rejects(fetchOpencodeUsage(7), LocalUsageNotFoundError);
  });
});
