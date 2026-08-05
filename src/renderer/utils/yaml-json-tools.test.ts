import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformYamlJson } from "./yaml-json-tools.js";

describe("transformYamlJson", () => {
  it("returns empty for blank input", () => {
    assert.deepEqual(transformYamlJson("  \n", { direction: "yaml-to-json" }), {
      ok: false,
      reason: "empty",
    });
  });

  it("converts YAML object to pretty JSON", () => {
    const r = transformYamlJson("b: 1\na: 2\n", {
      direction: "yaml-to-json",
      indent: 2,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.text, '{\n  "b": 1,\n  "a": 2\n}');
    }
  });

  it("converts YAML to minified JSON with sorted keys", () => {
    const r = transformYamlJson("b: 1\na: 2\n", {
      direction: "yaml-to-json",
      jsonMode: "minify",
      sortKeys: true,
    });
    assert.deepEqual(r, { ok: true, text: '{"a":2,"b":1}' });
  });

  it("keeps YAML timestamps when sorting keys", () => {
    const r = transformYamlJson("z: 1\nat: 2024-01-02T03:04:05Z\n", {
      direction: "yaml-to-json",
      jsonMode: "minify",
      sortKeys: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      const parsed = JSON.parse(r.text) as { at: unknown; z: number };
      assert.equal(parsed.z, 1);
      assert.equal(typeof parsed.at, "string");
      assert.match(String(parsed.at), /^2024-01-02T03:04:05/);
      // Keys are sorted — `at` before `z`.
      assert.equal(Object.keys(parsed).join(","), "at,z");
    }
  });

  it("converts JSON to YAML with indent 2", () => {
    const r = transformYamlJson('{"name":"demo","port":8080}', {
      direction: "json-to-yaml",
      indent: 2,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.text, "name: demo\nport: 8080");
    }
  });

  it("converts nested JSON to YAML with sorted keys", () => {
    const r = transformYamlJson('{"z":1,"a":{"d":2,"c":3}}', {
      direction: "json-to-yaml",
      indent: 2,
      sortKeys: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.text, "a:\n  c: 3\n  d: 2\nz: 1");
    }
  });

  it("returns invalid for garbage YAML", () => {
    assert.deepEqual(
      transformYamlJson('key: "unclosed', { direction: "yaml-to-json" }),
      { ok: false, reason: "invalid" },
    );
  });

  it("returns invalid for garbage JSON", () => {
    assert.deepEqual(
      transformYamlJson("{nope}", { direction: "json-to-yaml" }),
      { ok: false, reason: "invalid" },
    );
  });

  it("accepts YAML / JSON primitives", () => {
    assert.deepEqual(
      transformYamlJson("42", { direction: "yaml-to-json", jsonMode: "minify" }),
      { ok: true, text: "42" },
    );
    assert.deepEqual(
      transformYamlJson('"hi"', { direction: "json-to-yaml" }),
      { ok: true, text: "hi" },
    );
  });

  it("round-trips a dense config snippet", () => {
    const yaml = ["server:", "  host: 0.0.0.0", "  port: 3000", "features:", "  - auth", "  - cache"].join(
      "\n",
    );
    const toJson = transformYamlJson(yaml, {
      direction: "yaml-to-json",
      indent: 2,
      sortKeys: true,
    });
    assert.equal(toJson.ok, true);
    if (!toJson.ok) return;

    const back = transformYamlJson(toJson.text, {
      direction: "json-to-yaml",
      indent: 2,
      sortKeys: true,
    });
    assert.equal(back.ok, true);
    if (back.ok) {
      assert.equal(
        back.text,
        ["features:", "  - auth", "  - cache", "server:", "  host: 0.0.0.0", "  port: 3000"].join("\n"),
      );
    }
  });
});
