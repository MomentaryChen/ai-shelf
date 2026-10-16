import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { LocalUsageNotFoundError } from "../local-sqlite.js";
import {
  fetchGooseUsage,
  gooseModelFromConfig,
  gooseSessionDbCandidates,
  parseGooseLedgerRow,
  parseGooseSessionRow,
} from "./goose.js";

const tmpRoots: string[] = [];
const savedRoot = process.env["GOOSE_PATH_ROOT"];
after(() => {
  if (savedRoot === undefined) delete process.env["GOOSE_PATH_ROOT"];
  else process.env["GOOSE_PATH_ROOT"] = savedRoot;
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

function tempGooseDb(): DatabaseSync {
  const root = mkdtempSync(join(tmpdir(), "usage-goose-"));
  tmpRoots.push(root);
  process.env["GOOSE_PATH_ROOT"] = root;
  const dir = join(root, "data", "sessions");
  mkdirSync(dir, { recursive: true });
  return new DatabaseSync(join(dir, "sessions.db"));
}

function sqliteUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

describe("gooseSessionDbCandidates", () => {
  it("puts an absolute GOOSE_PATH_ROOT first and ignores relative roots", () => {
    const root = join(tmpdir(), "goose-root");
    assert.equal(
      gooseSessionDbCandidates({ GOOSE_PATH_ROOT: root }, "linux", "/h")[0],
      join(root, "data", "sessions", "sessions.db"),
    );
    assert.equal(
      gooseSessionDbCandidates({ GOOSE_PATH_ROOT: "rel" }, "linux", "/h")[0],
      join("/h", ".local", "share", "goose", "sessions", "sessions.db"),
    );
  });

  it("uses %APPDATA%\\Block\\goose\\data on Windows", () => {
    assert.equal(
      gooseSessionDbCandidates({ APPDATA: "C:\\R" }, "win32", "C:\\h")[0],
      join("C:\\R", "Block", "goose", "data", "sessions", "sessions.db"),
    );
  });
});

describe("goose row parsers", () => {
  it("reads model_name from model_config_json", () => {
    assert.equal(gooseModelFromConfig('{"model_name":"gpt-4o","context_limit":128000}'), "gpt-4o");
    assert.equal(gooseModelFromConfig("{bad"), undefined);
    assert.equal(gooseModelFromConfig(null), undefined);
  });

  it("parses ledger rows with second or millisecond timestamps", () => {
    const row = { created_timestamp: 1_760_000_000, model: "m", input_tokens: 10, output_tokens: 2, cost: 0.01 };
    assert.deepEqual(parseGooseLedgerRow(row), {
      timestampMs: 1_760_000_000_000,
      costUsd: 0.01,
      inputTokens: 10,
      outputTokens: 2,
      model: "m",
    });
    assert.equal(parseGooseLedgerRow({ ...row, created_timestamp: 1_760_000_000_000 })?.timestampMs, 1_760_000_000_000);
    assert.equal(parseGooseLedgerRow({ cost: null, input_tokens: 5, created_timestamp: 1_760_000_000 })?.costUsd, 0);
  });

  it("parses session rows with SQLite UTC text timestamps", () => {
    assert.deepEqual(
      parseGooseSessionRow({
        accumulated_input_tokens: 500,
        accumulated_output_tokens: 80,
        accumulated_cost: null,
        model_config_json: '{"model_name":"qwen3"}',
        updated_at: "2026-10-15 08:00:00",
      }),
      {
        timestampMs: Date.parse("2026-10-15T08:00:00Z"),
        costUsd: 0,
        inputTokens: 500,
        outputTokens: 80,
        model: "qwen3",
      },
    );
  });
});

describe("fetchGooseUsage", () => {
  it("prefers the usage ledger when it has rows", async () => {
    const db = tempGooseDb();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, accumulated_input_tokens INTEGER, accumulated_output_tokens INTEGER,
        updated_at TIMESTAMP);
      CREATE TABLE usage_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
        created_timestamp INTEGER NOT NULL, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
        total_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, cost REAL, cost_source TEXT,
        is_compaction INTEGER DEFAULT 0);
    `);
    const nowSec = Math.floor(Date.now() / 1000) - 60;
    db.prepare("INSERT INTO sessions VALUES ('s', 9999, 9999, ?)").run(sqliteUtc(Date.now()));
    const ins = db.prepare(
      "INSERT INTO usage_ledger (session_id, created_timestamp, model, input_tokens, output_tokens, cost) VALUES ('s', ?, ?, ?, ?, ?)",
    );
    ins.run(nowSec, "gpt-4o", 100, 20, 0.02);
    ins.run(nowSec * 1000, "gpt-4o", 50, 10, null);
    ins.run(nowSec - 200 * 86_400, "gpt-4o", 1, 1, 5);
    db.close();

    const result = await fetchGooseUsage(30);
    assert.equal(result.totalInputTokens, 150);
    assert.equal(result.totalOutputTokens, 30);
    assert.equal(result.totalCostUsd, 0.02);
  });

  it("falls back to session totals on pre-ledger schemas (no cost column)", async () => {
    const db = tempGooseDb();
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, working_dir TEXT, accumulated_input_tokens INTEGER,
      accumulated_output_tokens INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.prepare("INSERT INTO sessions (id, working_dir, accumulated_input_tokens, accumulated_output_tokens) VALUES ('a', '/w', 300, 40)").run();
    db.close();

    const result = await fetchGooseUsage(7);
    assert.equal(result.totalInputTokens, 300);
    assert.equal(result.totalOutputTokens, 40);
    assert.equal(result.totalCostUsd, 0);
  });

  it("reports not-found when no sessions.db exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "usage-goose-empty-"));
    tmpRoots.push(root);
    process.env["GOOSE_PATH_ROOT"] = root;
    const candidates = gooseSessionDbCandidates();
    // Only meaningful when the developer machine has no real Goose install at the fallback paths.
    if (candidates.slice(1).some((p) => existsSync(p))) return;
    await assert.rejects(fetchGooseUsage(7), LocalUsageNotFoundError);
  });
});
