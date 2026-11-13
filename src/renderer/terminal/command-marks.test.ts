import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CommandMarkTracker,
  findPromptLine,
  formatCommandDuration,
  getCommandStatus,
  parseOsc133,
  setCommandStatus,
  subscribeCommandStatus,
  type MarkPoint,
  type Osc133Mark,
} from "./command-marks";

/** Test marker: a mutable line (-1 = trimmed). */
interface FakeMarker {
  line: number;
  disposed: boolean;
}

const lineOf = (m: FakeMarker) => (m.disposed ? -1 : m.line);

function setup(max?: number) {
  const disposed: FakeMarker[] = [];
  const tracker = new CommandMarkTracker<FakeMarker>({
    dispose: (m) => {
      m.disposed = true;
      disposed.push(m);
    },
    maxCommands: max,
  });
  const at = (line: number, col = 0): MarkPoint<FakeMarker> => ({
    marker: { line, disposed: false },
    col,
  });
  const mark = (data: string, point: MarkPoint<FakeMarker> | null, now: number | null = 0) =>
    tracker.apply(parseOsc133(data) as Osc133Mark, point, now);
  return { tracker, at, mark, disposed };
}

describe("parseOsc133", () => {
  it("parses A/B/C and D with or without a code", () => {
    assert.deepEqual(parseOsc133("A"), { kind: "A" });
    assert.deepEqual(parseOsc133("A;cl=m;aid=1"), { kind: "A" });
    assert.deepEqual(parseOsc133("B"), { kind: "B" });
    assert.deepEqual(parseOsc133("C"), { kind: "C" });
    assert.deepEqual(parseOsc133("D;0"), { kind: "D", exitCode: 0 });
    assert.deepEqual(parseOsc133("D;130"), { kind: "D", exitCode: 130 });
    assert.deepEqual(parseOsc133("D;-1"), { kind: "D", exitCode: -1 });
    assert.deepEqual(parseOsc133("D"), { kind: "D", exitCode: null });
    assert.deepEqual(parseOsc133("D;oops"), { kind: "D", exitCode: null });
  });

  it("ignores unknown kinds", () => {
    assert.equal(parseOsc133("P;k=i"), null);
    assert.equal(parseOsc133(""), null);
  });
});

describe("CommandMarkTracker", () => {
  it("records a full A/B/C/D cycle with exit code and duration", () => {
    const { tracker, at, mark } = setup();
    assert.equal(tracker.seen, false);
    assert.equal(mark("A", at(0), 1000), false);
    assert.equal(tracker.seen, true);
    mark("B", at(0, 2), 1000);
    mark("C", at(1), 2000);
    assert.equal(tracker.lastStatus(), null, "still running");
    assert.equal(mark("D;2", at(4), 3500), true);
    assert.deepEqual(tracker.lastStatus(), { exitCode: 2, durationMs: 1500 });
    assert.deepEqual(tracker.lastOutputRange(lineOf), { startLine: 1, endLine: 3 });
  });

  it("starts output on the next line when C is emitted mid-line", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    mark("C", at(0, 9));
    mark("D;0", at(3));
    assert.deepEqual(tracker.lastOutputRange(lineOf), { startLine: 1, endLine: 2 });
  });

  it("includes a partial last line when output lacks a trailing newline", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    mark("C", at(1));
    mark("D;0", at(1, 3));
    assert.deepEqual(tracker.lastOutputRange(lineOf), { startLine: 1, endLine: 1, endCol: 3 });
  });

  it("prompt redraws move the prompt instead of adding commands", () => {
    const { tracker, at, mark, disposed } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    // Ctrl+C / empty Enter: bash and pwsh redraw without C or D.
    mark("A", at(1));
    mark("B", at(1, 2));
    assert.equal(tracker.commands.length, 1);
    assert.deepEqual(tracker.promptLines(lineOf), [1]);
    assert.equal(disposed.length, 2);
    assert.equal(tracker.lastStatus(), null);
  });

  it("D without C or code is not a command result", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    assert.equal(mark("D", at(1)), false);
    assert.equal(tracker.lastStatus(), null);
  });

  it("a missing D is closed by the next prompt (copy stops before it)", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    mark("C", at(1));
    mark("A", at(5));
    assert.equal(tracker.commands.length, 2);
    assert.equal(tracker.lastStatus(), null, "no code, no D");
    assert.deepEqual(tracker.lastOutputRange(lineOf), { startLine: 1, endLine: 4 });
  });

  it("tolerates missing A/B (D only — status still reported)", () => {
    const { tracker, at, mark } = setup();
    assert.equal(mark("D;1", at(0), 10), true);
    assert.deepEqual(tracker.lastStatus(), { exitCode: 1, durationMs: null });
    assert.equal(tracker.lastOutputRange(lineOf), null);
  });

  it("C without A/B starts a command", () => {
    const { tracker, at, mark } = setup();
    mark("C", at(2), 100);
    mark("D;0", at(4), 150);
    assert.deepEqual(tracker.lastStatus(), { exitCode: 0, durationMs: 50 });
    assert.deepEqual(tracker.lastOutputRange(lineOf), { startLine: 2, endLine: 3 });
  });

  it("unknown times (replayed backlog) give no duration", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0), null);
    mark("C", at(1), null);
    mark("D;0", at(2), null);
    assert.deepEqual(tracker.lastStatus(), { exitCode: 0, durationMs: null });
  });

  it("null points (alt buffer) still advance state", () => {
    const { tracker, mark } = setup();
    mark("A", null);
    mark("B", null);
    mark("C", null, 0);
    assert.equal(mark("D;0", null, 5), true);
    assert.deepEqual(tracker.lastStatus(), { exitCode: 0, durationMs: 5 });
    assert.equal(tracker.lastOutputRange(lineOf), null);
    assert.deepEqual(tracker.promptLines(lineOf), []);
  });

  it("skips trimmed markers", () => {
    const { tracker, at, mark } = setup();
    const first = at(0);
    mark("A", first);
    mark("C", at(1));
    mark("D;0", at(2));
    mark("A", at(3));
    first.marker.disposed = true;
    assert.deepEqual(tracker.promptLines(lineOf), [3]);
  });

  it("returns null output range when the output start scrolled away", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    const c = at(1);
    mark("C", c);
    mark("D;0", at(5));
    c.marker.disposed = true;
    assert.equal(tracker.lastOutputRange(lineOf), null);
  });

  it("evicts old commands and disposes their markers", () => {
    const { tracker, at, mark, disposed } = setup(2);
    for (let i = 0; i < 3; i++) {
      mark("A", at(i * 3));
      mark("C", at(i * 3 + 1));
      mark("D;0", at(i * 3 + 2));
    }
    assert.equal(tracker.commands.length, 2);
    assert.equal(disposed.length, 3);
    tracker.reset();
    assert.equal(tracker.commands.length, 0);
    assert.equal(disposed.length, 9);
  });
});

describe("findPromptLine", () => {
  const lines = [0, 10, 20, 30];
  it("finds the previous prompt above the viewport top", () => {
    assert.equal(findPromptLine(lines, 25, "prev"), 20);
    assert.equal(findPromptLine(lines, 20, "prev"), 10);
    assert.equal(findPromptLine(lines, 0, "prev"), null);
  });
  it("finds the next prompt below the viewport top", () => {
    assert.equal(findPromptLine(lines, 10, "next"), 20);
    assert.equal(findPromptLine(lines, 30, "next"), null);
    assert.equal(findPromptLine([], 0, "next"), null);
  });
});

describe("formatCommandDuration", () => {
  it("formats compact durations", () => {
    assert.equal(formatCommandDuration(0), "0ms");
    assert.equal(formatCommandDuration(850), "850ms");
    assert.equal(formatCommandDuration(4250), "4.2s");
    assert.equal(formatCommandDuration(37_900), "37s");
    assert.equal(formatCommandDuration(125_000), "2m 05s");
    assert.equal(formatCommandDuration(3_780_000), "1h 03m");
    assert.equal(formatCommandDuration(-1), "");
  });
});

describe("command status store", () => {
  it("notifies on change and skips no-op updates", () => {
    let calls = 0;
    const off = subscribeCommandStatus(() => calls++);
    setCommandStatus("s1", { exitCode: 0, durationMs: 5 });
    setCommandStatus("s1", { exitCode: 0, durationMs: 5 });
    assert.equal(calls, 1);
    assert.deepEqual(getCommandStatus("s1"), { exitCode: 0, durationMs: 5 });
    assert.equal(getCommandStatus("other"), null);
    setCommandStatus("s1", null);
    assert.equal(getCommandStatus("s1"), null);
    assert.equal(calls, 2);
    off();
    setCommandStatus("s1", { exitCode: 1, durationMs: null });
    assert.equal(calls, 2);
    setCommandStatus("s1", null);
  });
});

describe("CommandMarkTracker ids and ranges", () => {
  it("assigns increasing ids that survive the cap", () => {
    const { tracker, at, mark } = setup(2);
    for (let i = 0; i < 4; i++) {
      mark("A", at(i * 3));
      mark("B", at(i * 3, 2));
      mark("C", at(i * 3 + 1));
      mark("D;0", at(i * 3 + 2));
    }
    assert.deepEqual(
      tracker.commands.map((e) => e.id),
      [3, 4],
    );
    assert.equal(tracker.byId(4)?.id, 4);
    assert.equal(tracker.byId(1), undefined);
    assert.equal(tracker.latest()?.id, 4);
  });

  it("inputRange spans B to C (C at column 0 → previous line)", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 4));
    mark("C", at(1, 0));
    const e = tracker.latest()!;
    assert.deepEqual(tracker.inputRange(e, lineOf), { startLine: 0, startCol: 4, endLine: 0 });
  });

  it("inputRange ends at C's column when C is mid-line", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(5));
    mark("B", at(5, 2));
    mark("C", at(6, 7));
    const e = tracker.latest()!;
    assert.deepEqual(tracker.inputRange(e, lineOf), {
      startLine: 5,
      startCol: 2,
      endLine: 6,
      endCol: 7,
    });
  });

  it("inputRange is null without B or with an empty line", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("C", at(1));
    assert.equal(tracker.inputRange(tracker.latest()!, lineOf), null);
    const t2 = setup();
    t2.mark("B", t2.at(3, 2));
    t2.mark("C", t2.at(3, 0));
    assert.equal(t2.tracker.inputRange(t2.tracker.latest()!, lineOf), null);
  });

  it("outputRange works for any finished entry and lastOutputRange delegates", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    mark("C", at(1));
    mark("D;0", at(4));
    mark("A", at(4));
    mark("B", at(4, 2));
    mark("C", at(5));
    mark("D;1", at(7));
    const [first, second] = tracker.commands;
    assert.deepEqual(tracker.outputRange(first!, lineOf), { startLine: 1, endLine: 3 });
    assert.deepEqual(tracker.outputRange(second!, lineOf), { startLine: 5, endLine: 6 });
    assert.deepEqual(tracker.lastOutputRange(lineOf), { startLine: 5, endLine: 6 });
    assert.equal(tracker.entryLine(first!, lineOf), 0);
  });

  it("outputRange is null while the command is still running", () => {
    const { tracker, at, mark } = setup();
    mark("A", at(0));
    mark("B", at(0, 2));
    mark("C", at(1));
    assert.equal(tracker.outputRange(tracker.latest()!, lineOf), null);
  });
});
