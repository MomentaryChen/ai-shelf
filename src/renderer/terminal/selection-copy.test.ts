import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSelectionAutoCopy,
  isProgrammaticSelection,
  withProgrammaticSelection,
} from "./selection-copy.js";

/** Manual timer queue + recorded copies, so tests drive time explicitly. */
function harness() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const copies: string[] = [];
  const dropped: string[] = [];
  const queued: string[] = [];
  const autoCopy = createSelectionAutoCopy<number>({
    delayMs: 50,
    setTimer: (fn) => {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    copy: (text) => copies.push(text),
    onQueued: (text) => queued.push(text),
    onDropped: (text) => dropped.push(text),
  });
  const fireTimers = () => {
    const fns = [...timers.values()];
    timers.clear();
    for (const fn of fns) fn();
  };
  return { autoCopy, copies, dropped, queued, timers, fireTimers };
}

/** Minimal stand-in for an xterm Terminal that routes select() through a listener. */
function fakeTerm(onChange: (text: string, programmatic: boolean) => void) {
  const term = {
    selection: "",
    select(text: string) {
      term.selection = text;
      onChange(text, isProgrammaticSelection(term));
    },
    clearSelection() {
      term.selection = "";
      onChange("", isProgrammaticSelection(term));
    },
  };
  return term;
}

describe("selection auto-copy", () => {
  it("copies a user selection once after the debounce", () => {
    const h = harness();
    h.autoCopy.userGesture();
    h.autoCopy.selectionChanged("hel", false);
    h.autoCopy.selectionChanged("hello", false);
    assert.deepEqual(h.copies, []);
    h.fireTimers();
    assert.deepEqual(h.copies, ["hello"]);
    h.fireTimers();
    assert.deepEqual(h.copies, ["hello"]);
  });

  it("never copies search-driven selections (select, change, clear, timer)", () => {
    const h = harness();
    const term = fakeTerm((text, prog) => h.autoCopy.selectionChanged(text, prog));
    withProgrammaticSelection(term, () => {
      term.clearSelection();
      term.select("match");
    });
    h.fireTimers();
    withProgrammaticSelection(term, () => term.select("match2"));
    term.clearSelection();
    h.fireTimers();
    assert.deepEqual(h.copies, []);
    assert.deepEqual(h.queued, []);
    assert.equal(h.timers.size, 0);
  });

  it("ignores later unguarded re-fires for a search-placed selection", () => {
    const h = harness();
    h.autoCopy.selectionChanged("match", true);
    // xterm re-emits onSelectionChange outside our guard (e.g. buffer trim).
    h.autoCopy.selectionChanged("match", false);
    h.fireTimers();
    h.autoCopy.flush();
    assert.deepEqual(h.copies, []);
  });

  it("copies a genuine user selection made right after a search", () => {
    const h = harness();
    const term = fakeTerm((text, prog) => h.autoCopy.selectionChanged(text, prog));
    withProgrammaticSelection(term, () => term.select("match"));
    assert.equal(isProgrammaticSelection(term), false);
    h.autoCopy.userGesture();
    term.clearSelection();
    term.select("user text");
    h.fireTimers();
    assert.deepEqual(h.copies, ["user text"]);
  });

  it("drops a queued user copy when search replaces the selection before it fires", () => {
    const h = harness();
    h.autoCopy.selectionChanged("user text", false);
    h.autoCopy.selectionChanged("match", true);
    h.fireTimers();
    assert.deepEqual(h.copies, []);
    assert.deepEqual(h.dropped, ["user text"]);
  });

  it("keeps a queued user copy when the selection is cleared by a focus change", () => {
    const h = harness();
    h.autoCopy.selectionChanged("hello", false);
    h.autoCopy.selectionChanged("", false);
    h.fireTimers();
    assert.deepEqual(h.copies, ["hello"]);
  });

  it("flush writes immediately and cancel drops the queued copy", () => {
    const h = harness();
    h.autoCopy.selectionChanged("a", false);
    h.autoCopy.flush();
    assert.deepEqual(h.copies, ["a"]);
    assert.equal(h.timers.size, 0);
    h.autoCopy.selectionChanged("b", false);
    h.autoCopy.cancel();
    h.fireTimers();
    assert.deepEqual(h.copies, ["a"]);
  });

  it("programmatic scope nests and is released when the callback throws", () => {
    const term = {};
    assert.throws(() =>
      withProgrammaticSelection(term, () => {
        withProgrammaticSelection(term, () => {
          assert.equal(isProgrammaticSelection(term), true);
        });
        assert.equal(isProgrammaticSelection(term), true);
        throw new Error("boom");
      }),
    );
    assert.equal(isProgrammaticSelection(term), false);
  });
});
