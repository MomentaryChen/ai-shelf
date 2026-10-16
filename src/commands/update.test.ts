import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UPDATE_TIMEOUT_MS,
  describeUpdateFailure,
  packageManagerFromInstallPath,
} from "./update.js";

describe("UPDATE_TIMEOUT_MS", () => {
  it("is far longer than the 10 s run() default", () => {
    assert.equal(UPDATE_TIMEOUT_MS, 10 * 60_000);
  });
});

describe("describeUpdateFailure", () => {
  const base = { ok: false, code: null, signal: null, timedOut: false } as const;

  it("reports timeouts in minutes, distinct from exit failures", () => {
    assert.equal(
      describeUpdateFailure("Claude Code", { ...base, timedOut: true, signal: "SIGTERM" }),
      "Claude Code update timed out after 10 minutes",
    );
    assert.equal(
      describeUpdateFailure("X", { ...base, timedOut: true }, 60_000),
      "X update timed out after 1 minute",
    );
  });

  it("reports non-zero exit codes", () => {
    assert.equal(
      describeUpdateFailure("Aider", { ...base, code: 2 }),
      "Aider update failed (exit code 2)",
    );
  });

  it("reports spawn errors and signals", () => {
    assert.equal(
      describeUpdateFailure("Goose", { ...base, error: new Error("spawn goose ENOENT") }),
      "Goose update failed: spawn goose ENOENT",
    );
    assert.equal(
      describeUpdateFailure("Crush", { ...base, signal: "SIGKILL" }),
      "Crush update failed (killed by SIGKILL)",
    );
  });
});

describe("packageManagerFromInstallPath", () => {
  it("detects pnpm global installs", () => {
    assert.equal(
      packageManagerFromInstallPath(
        "C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\ai-shelf\\dist\\cli.js",
      ),
      "pnpm",
    );
    assert.equal(
      packageManagerFromInstallPath(
        "/home/me/.local/share/pnpm/global/5/.pnpm/ai-shelf@4.3.5/node_modules/ai-shelf/dist/cli.js",
      ),
      "pnpm",
    );
  });

  it("detects yarn global installs", () => {
    assert.equal(
      packageManagerFromInstallPath(
        "C:\\Users\\me\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\ai-shelf\\dist\\cli.js",
      ),
      "yarn",
    );
    assert.equal(
      packageManagerFromInstallPath(
        "/home/me/.config/yarn/global/node_modules/ai-shelf/dist/cli.js",
      ),
      "yarn",
    );
  });

  it("falls back to npm", () => {
    assert.equal(
      packageManagerFromInstallPath(
        "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\ai-shelf\\dist\\cli.js",
      ),
      "npm",
    );
    assert.equal(
      packageManagerFromInstallPath("/usr/local/lib/node_modules/ai-shelf/dist/cli.js"),
      "npm",
    );
  });
});
