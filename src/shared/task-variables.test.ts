import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractTaskVariables,
  fillTaskVariables,
  isBuiltinTaskVariable,
  missingTaskVariables,
} from "./task-variables.js";

test("extractTaskVariables: order of first appearance, case-insensitive dedupe", () => {
  assert.deepEqual(
    extractTaskVariables("Review {{branch}} in {{ file }}; again {{Branch}} and {{ticket_id}}"),
    ["branch", "file", "ticket_id"],
  );
});

test("extractTaskVariables: ignores non-identifier placeholders", () => {
  assert.deepEqual(
    extractTaskVariables("${{ secrets.TOKEN }} {{ .Values.x }} {{}} {{1abc}} {{ok-name}}"),
    ["ok-name"],
  );
});

test("fillTaskVariables: replaces every occurrence, case-insensitively", () => {
  assert.equal(fillTaskVariables("a {{x}} b {{ X }} c {{y}}", { x: "1", Y: "2" }), "a 1 b 1 c 2");
});

test("fillTaskVariables: single pass — values are not expanded again", () => {
  assert.equal(fillTaskVariables("{{a}} {{b}}", { a: "{{b}}", b: "B" }), "{{b}} B");
});

test("fillTaskVariables: unknown names stay in place", () => {
  assert.equal(fillTaskVariables("x {{missing}} y", {}), "x {{missing}} y");
});

test("fillTaskVariables: `$` in values is literal", () => {
  assert.equal(fillTaskVariables("{{a}}", { a: "$& $1 $$" }), "$& $1 $$");
});

test("missingTaskVariables + isBuiltinTaskVariable", () => {
  assert.deepEqual(missingTaskVariables(["a", "b", "c"], { a: "x", b: "  " }), ["b", "c"]);
  assert.equal(isBuiltinTaskVariable("Branch"), true);
  assert.equal(isBuiltinTaskVariable("ticket"), false);
});
