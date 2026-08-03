import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createUserPreset,
  flagsToString,
  isValidSearchRegex,
  loadSavedPresets,
  parseFlags,
  replaceRegex,
  saveSavedPresets,
  testRegex,
} from "./regex-tools.js";

describe("flagsToString / parseFlags", () => {
  it("round-trips known flags in stable order", () => {
    assert.equal(flagsToString({ i: true, g: true, m: true }), "gim");
    assert.deepEqual(parseFlags("mig"), { g: true, i: true, m: true });
  });

  it("ignores unknown flag chars", () => {
    assert.deepEqual(parseFlags("gix"), { g: true, i: true });
  });
});

describe("isValidSearchRegex", () => {
  it("accepts valid patterns", () => {
    assert.equal(isValidSearchRegex("err(or)?", "i"), true);
  });

  it("rejects empty or broken patterns", () => {
    assert.equal(isValidSearchRegex(""), false);
    assert.equal(isValidSearchRegex("("), false);
  });
});

describe("testRegex", () => {
  it("returns empty error when pattern is blank", () => {
    assert.deepEqual(testRegex("", "g", "abc"), { ok: false, error: "empty" });
  });

  it("returns invalid for broken syntax", () => {
    assert.deepEqual(testRegex("(", "g", "abc"), { ok: false, error: "invalid" });
  });

  it("finds all global matches with groups", () => {
    const r = testRegex("(\\w+)=(\\d+)", "g", "a=1 b=2");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.matches.length, 2);
    assert.equal(r.matches[0]?.match, "a=1");
    assert.deepEqual(r.matches[0]?.groups, ["a", "1"]);
    assert.equal(r.matches[1]?.match, "b=2");
  });

  it("returns only the first match without g", () => {
    const r = testRegex("\\d+", "", "a1 b2");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.matches.length, 1);
    assert.equal(r.matches[0]?.match, "1");
  });

  it("captures named groups", () => {
    const r = testRegex("(?<num>\\d+)", "g", "x42");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.matches[0]?.namedGroups.num, "42");
  });

  it("truncates at maxMatches", () => {
    const r = testRegex("a", "g", "aaaa", 2);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.matches.length, 2);
    assert.equal(r.truncated, true);
  });
});

describe("replaceRegex", () => {
  it("replaces globally", () => {
    const r = replaceRegex("\\s+", "g", "a   b\tc", " ");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result, "a b c");
    assert.equal(r.count, 2);
  });

  it("supports capture substitutions", () => {
    const r = replaceRegex("(\\w+)@(\\w+)", "g", "a@b", "$2/$1");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result, "b/a");
  });

  it("returns invalid for broken patterns", () => {
    assert.deepEqual(replaceRegex("(", "g", "x", "y"), { ok: false, error: "invalid" });
  });
});

describe("presets persistence", () => {
  it("createUserPreset validates name and pattern", () => {
    assert.equal(createUserPreset({ name: "", pattern: "a", flags: "g" }), null);
    assert.equal(createUserPreset({ name: "x", pattern: "(", flags: "g" }), null);
    const p = createUserPreset({
      name: " emails ",
      pattern: "\\w+@\\w+",
      flags: "gi",
      sample: "a@b",
    });
    assert.ok(p);
    assert.equal(p?.name, "emails");
    assert.equal(p?.flags, "gi");
    assert.equal(p?.builtin, false);
  });

  it("round-trips through a mock storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const preset = createUserPreset({
      name: "mine",
      pattern: "foo+",
      flags: "i",
      replacement: "bar",
    });
    assert.ok(preset);
    saveSavedPresets([preset!], storage);
    const loaded = loadSavedPresets(storage);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.name, "mine");
    assert.equal(loaded[0]?.pattern, "foo+");
    assert.equal(loaded[0]?.replacement, "bar");
  });
});
