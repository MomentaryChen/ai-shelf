import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InitialInputGate, bracketedPaste, looksLikeBlockingDialog } from "./pty-initial-input.js";

const opts = { minDelayMs: 1000, quietMs: 500, maxWaitMs: 10_000, dialogTimeoutMs: 60_000 };

describe("InitialInputGate", () => {
  it("waits for output, then a quiet period", () => {
    const gate = new InitialInputGate(0, opts);
    assert.equal(gate.decide(1200), "wait"); // no output yet
    gate.noteOutput("Welcome to Claude Code", 1300);
    assert.equal(gate.decide(1500), "wait");
    assert.equal(gate.decide(1800), "fire");
  });

  it("respects the minimum delay", () => {
    const gate = new InitialInputGate(0, opts);
    gate.noteOutput("ready", 10);
    assert.equal(gate.decide(900), "wait");
    assert.equal(gate.decide(1000), "fire");
  });

  it("fires after the max wait when output never settles", () => {
    const gate = new InitialInputGate(0, opts);
    for (let t = 100; t < 10_000; t += 100) gate.noteOutput("⠋", t);
    assert.equal(gate.decide(9_950), "wait");
    assert.equal(gate.decide(10_000), "fire");
  });

  it("holds while a trust dialog is on screen, then fires after a redraw", () => {
    const gate = new InitialInputGate(0, opts);
    gate.noteOutput("\x1b[1mDo you trust the files in this folder?\x1b[0m", 500);
    assert.equal(gate.decide(20_000), "wait");
    gate.noteOutput("Welcome back!", 30_000); // user answered; new burst
    assert.equal(gate.decide(30_600), "fire");
  });

  it("gives up if the dialog never goes away", () => {
    const gate = new InitialInputGate(0, opts);
    gate.noteOutput("Select login method:", 100);
    assert.equal(gate.decide(60_000), "give-up");
  });
});

describe("helpers", () => {
  it("detects dialogs through ANSI codes", () => {
    assert.equal(looksLikeBlockingDialog("Do\x1b[0m you trust this folder"), true);
    assert.equal(looksLikeBlockingDialog("Tip: use /help"), false);
  });

  it("wraps text in a bracketed paste with CR newlines and no ESC", () => {
    assert.equal(bracketedPaste("a\r\nb\nc\x1b[201~"), "\x1b[200~a\rb\rc[201~\x1b[201~");
  });
});
