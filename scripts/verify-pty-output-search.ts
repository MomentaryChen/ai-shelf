import assert from "node:assert/strict";
import {
  collectPtyTextMatches,
  isValidSearchRegex,
  searchPtyOutput,
} from "../src/shared/pty-output-search.ts";

const buf = "hello world\nfoo bar foo\nERROR: fail\nHello";

assert.equal(collectPtyTextMatches(buf, "foo", {}).matches.length, 2);
assert.equal(collectPtyTextMatches(buf, "foo", { wholeWord: true }).matches.length, 2);
assert.equal(collectPtyTextMatches(buf, "fo", { wholeWord: true }).matches.length, 0);
assert.equal(collectPtyTextMatches(buf, "foo|ERROR", { regex: true }).matches.length, 3);
assert.equal(collectPtyTextMatches(buf, "hello", { caseSensitive: false }).matches.length, 2);
assert.equal(collectPtyTextMatches(buf, "hello", { caseSensitive: true }).matches.length, 1);
assert.equal(isValidSearchRegex("("), false);
assert.equal(searchPtyOutput(buf, "bar", { wholeWord: true }).total, 1);
assert.equal(searchPtyOutput(buf, "err.*", { regex: true, caseSensitive: false }).total, 1);

console.log("ok");
