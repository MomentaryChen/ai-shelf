import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlowRunnerEnv,
  expandEnvPlaceholders,
  formatEnvLines,
  parseEnvLines,
} from "./flow-env.js";

describe("flow-env", () => {
  it("expands ${VAR} and blanks unknown variables", () => {
    assert.equal(expandEnvPlaceholders("${A}-${B}-$C", { A: "1" }), "1--$C");
  });

  it("adds profile binding vars and expands flow env against the base env", () => {
    const env = buildFlowRunnerEnv({
      flowEnv: { PATH: "${PATH};C:\\tools", WHO: "${AISHELF_PROFILE_NAME}" },
      profile: { id: "p1", name: "Work" },
      baseEnv: { PATH: "C:\\bin" },
    });
    assert.deepEqual(env, {
      AISHELF_PROFILE_ID: "p1",
      AISHELF_PROFILE_NAME: "Work",
      PATH: "C:\\bin;C:\\tools",
      WHO: "Work",
    });
    assert.deepEqual(buildFlowRunnerEnv({}), {});
  });

  it("round-trips KEY=value lines and reports bad lines", () => {
    const parsed = parseEnvLines("# comment\nA=1\n\nB = two=2 \n");
    assert.deepEqual(parsed, { env: { A: "1", B: "two=2" } });
    assert.equal(formatEnvLines({ A: "1", B: "two=2" }), "A=1\nB=two=2");
    assert.ok("error" in parseEnvLines("novalue"));
    assert.ok("error" in parseEnvLines("1X=2"));
  });
});
