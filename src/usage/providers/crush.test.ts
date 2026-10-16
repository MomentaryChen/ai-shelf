import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { LocalUsageNotFoundError } from "../local-sqlite.js";
import { crushGlobalDataDir, fetchCrushUsage, parseCrushProjects, parseCrushSession } from "./crush.js";

const tmpRoots: string[] = [];
const savedGlobal = process.env["CRUSH_GLOBAL_DATA"];
after(() => {
  if (savedGlobal === undefined) delete process.env["CRUSH_GLOBAL_DATA"];
  else process.env["CRUSH_GLOBAL_DATA"] = savedGlobal;
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

describe("crushGlobalDataDir", () => {
  it("follows CRUSH_GLOBAL_DATA → XDG_DATA_HOME → LOCALAPPDATA (win) → ~/.local/share", () => {
    assert.equal(crushGlobalDataDir({ CRUSH_GLOBAL_DATA: "/g", XDG_DATA_HOME: "/x" }, "linux", "/h"), "/g");
    assert.equal(crushGlobalDataDir({ XDG_DATA_HOME: "/x" }, "win32", "/h"), join("/x", "crush"));
    assert.equal(crushGlobalDataDir({ LOCALAPPDATA: "C:\\L" }, "win32", "/h"), join("C:\\L", "crush"));
    assert.equal(crushGlobalDataDir({}, "darwin", "/h"), join("/h", ".local", "share", "crush"));
  });
});

describe("parseCrushProjects", () => {
  it("accepts { projects: [] }, bare arrays and id-keyed objects", () => {
    const expected = [join("/p/a", ".crush", "crush.db")];
    assert.deepEqual(parseCrushProjects({ projects: [{ path: "/p/a", data_dir: ".crush" }] }), expected);
    assert.deepEqual(parseCrushProjects([{ path: "/p/a" }]), expected);
    assert.deepEqual(parseCrushProjects({ abc: { path: "/p/a", data_dir: ".crush" } }), expected);
  });

  it("keeps absolute data_dir, de-duplicates and skips junk", () => {
    const abs = join(tmpdir(), "crush-data");
    assert.deepEqual(
      parseCrushProjects({
        projects: [
          { path: "/p/a", data_dir: abs },
          { path: "/p/b", data_dir: abs },
          { data_dir: ".crush" },
          null,
          "x",
        ],
      }),
      [join(abs, "crush.db")],
    );
    assert.deepEqual(parseCrushProjects(null), []);
  });
});

describe("parseCrushSession", () => {
  it("maps session totals and treats timestamps as epoch seconds", () => {
    assert.deepEqual(
      parseCrushSession(
        { prompt_tokens: 1200, completion_tokens: 300, cost: 0.04, created_at: 1_760_000_000, updated_at: 1_760_000_600 },
        "gpt-5",
      ),
      { timestampMs: 1_760_000_600_000, costUsd: 0.04, inputTokens: 1200, outputTokens: 300, model: "gpt-5" },
    );
  });

  it("falls back to created_at and rejects rows without timestamps", () => {
    assert.equal(parseCrushSession({ created_at: 1_760_000_000 })?.timestampMs, 1_760_000_000_000);
    assert.equal(parseCrushSession({ cost: 1 }), null);
  });
});

describe("fetchCrushUsage", () => {
  it("reads top-level sessions from each registered project database", async () => {
    const root = mkdtempSync(join(tmpdir(), "usage-crush-"));
    tmpRoots.push(root);
    const project = join(root, "proj");
    mkdirSync(join(project, ".crush"), { recursive: true });
    process.env["CRUSH_GLOBAL_DATA"] = join(root, "global");
    mkdirSync(join(root, "global"));
    writeFileSync(
      join(root, "global", "projects.json"),
      JSON.stringify({ projects: [{ path: project, data_dir: ".crush" }, { path: join(root, "gone") }] }),
    );

    const db = new DatabaseSync(join(project, ".crush", "crush.db"));
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_session_id TEXT, title TEXT NOT NULL, message_count INTEGER,
        prompt_tokens INTEGER, completion_tokens INTEGER, cost REAL, updated_at INTEGER, created_at INTEGER);
      CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, parts TEXT, model TEXT,
        created_at INTEGER, updated_at INTEGER);
    `);
    const now = Math.floor(Date.now() / 1000) - 60;
    const s = db.prepare("INSERT INTO sessions VALUES (?, ?, 't', 0, ?, ?, ?, ?, ?)");
    s.run("top", null, 1000, 200, 0.5, now, now);
    s.run("child", "top", 400, 50, 0.1, now, now);
    const m = db.prepare("INSERT INTO messages VALUES (?, 'top', 'assistant', '[]', ?, 0, 0)");
    m.run("m1", "model-a");
    m.run("m2", "model-b");
    m.run("m3", "model-b");
    db.close();

    const result = await fetchCrushUsage(7);
    assert.equal(result.totalInputTokens, 1000);
    assert.equal(result.totalOutputTokens, 200);
    assert.equal(result.totalCostUsd, 0.5);
    assert.equal(result.byModel?.[0]?.model, "model-b");
  });

  it("reports not-found without projects.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "usage-crush-empty-"));
    tmpRoots.push(root);
    process.env["CRUSH_GLOBAL_DATA"] = root;
    await assert.rejects(fetchCrushUsage(7), LocalUsageNotFoundError);
  });
});
