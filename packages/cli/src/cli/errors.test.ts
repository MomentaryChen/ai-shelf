/* eslint-disable @typescript-eslint/no-floating-promises -- node:test tracks describe/it promises itself */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError, DatabaseError } from "../core/errors/app-error.js";
import { DEBUG_ENV, formatCliError, handleError, isDebugEnabled } from "./errors.js";

describe("isDebugEnabled", () => {
  it("is off when unset, empty or falsy", () => {
    assert.equal(isDebugEnabled({}), false);
    for (const v of ["", "0", "false", "FALSE", "off", "  "]) {
      assert.equal(isDebugEnabled({ [DEBUG_ENV]: v }), false, v);
    }
  });

  it("is on for truthy values", () => {
    for (const v of ["1", "true", "yes", "on"]) {
      assert.equal(isDebugEnabled({ [DEBUG_ENV]: v }), true, v);
    }
  });
});

describe("formatCliError", () => {
  it("prints an AppError as a single line without a stack", () => {
    const out = formatCliError(new AppError('Session "x" not found', "SESSION_NOT_FOUND"), false);
    assert.equal(out, 'Error: Session "x" not found');
  });

  it("hints at the debug env for unexpected errors", () => {
    const out = formatCliError(new TypeError("boom"), false);
    const lines = out.split("\n");
    assert.equal(lines[0], "Error: boom");
    assert.match(lines[1] ?? "", new RegExp(`${DEBUG_ENV}=1`));
    assert.doesNotMatch(out, /\bat /);
  });

  it("handles non-Error values", () => {
    assert.match(formatCliError("plain", false), /^Error: plain/);
  });

  it("includes stacks and causes in debug mode", () => {
    const cause = new Error("SQLITE_BUSY");
    const out = formatCliError(new DatabaseError("Failed to open database", cause), true);
    assert.match(out, /^Error: Failed to open database/);
    assert.match(out, /DatabaseError: Failed to open database\n\s+at /);
    assert.match(out, /Caused by: SQLITE_BUSY/);
  });
});

describe("handleError", () => {
  it("forwards the error unchanged without printing", () => {
    const err = new AppError("x", "X");
    const original = console.error;
    let printed = false;
    console.error = () => {
      printed = true;
    };
    try {
      assert.throws(
        () => handleError(err),
        (e: unknown) => e === err,
      );
    } finally {
      console.error = original;
    }
    assert.equal(printed, false);
  });
});
