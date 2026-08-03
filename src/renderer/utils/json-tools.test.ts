import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortKeysDeep, transformJson } from "./json-tools.js";

describe("sortKeysDeep", () => {
  it("sorts object keys recursively", () => {
    assert.deepEqual(sortKeysDeep({ b: 1, a: { d: 2, c: 3 } }), {
      a: { c: 3, d: 2 },
      b: 1,
    });
  });

  it("preserves array order", () => {
    assert.deepEqual(sortKeysDeep([{ z: 1, a: 2 }, 3]), [{ a: 2, z: 1 }, 3]);
  });
});

describe("transformJson", () => {
  it("returns empty for blank input", () => {
    assert.deepEqual(transformJson("  \n", { mode: "pretty" }), {
      ok: false,
      reason: "empty",
    });
  });

  it("returns invalid for garbage", () => {
    assert.deepEqual(transformJson("{nope}", { mode: "pretty" }), {
      ok: false,
      reason: "invalid",
    });
  });

  it("pretty-prints with indent 2", () => {
    const r = transformJson('{"b":1,"a":2}', { mode: "pretty", indent: 2 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.text, '{\n  "b": 1,\n  "a": 2\n}');
    }
  });

  it("pretty-prints with indent 4 and sorted keys", () => {
    const r = transformJson('{"b":1,"a":2}', {
      mode: "pretty",
      indent: 4,
      sortKeys: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.text, '{\n    "a": 2,\n    "b": 1\n}');
    }
  });

  it("minifies", () => {
    const r = transformJson('{\n  "a": 1\n}', { mode: "minify" });
    assert.deepEqual(r, { ok: true, text: '{"a":1}' });
  });

  it("accepts JSON primitives", () => {
    assert.deepEqual(transformJson("42", { mode: "minify" }), {
      ok: true,
      text: "42",
    });
    assert.deepEqual(transformJson('"hi"', { mode: "minify" }), {
      ok: true,
      text: '"hi"',
    });
    assert.deepEqual(transformJson("true", { mode: "minify" }), {
      ok: true,
      text: "true",
    });
    assert.deepEqual(transformJson("null", { mode: "minify" }), {
      ok: true,
      text: "null",
    });
  });
});
