import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PopoutRegistry, type PopoutEntry } from "./popout-registry.js";

function entry(paneId: string, popoutId: number, originId: number): PopoutEntry {
  return {
    pane: { id: paneId, tool: "shell", sessionId: `s-${paneId}`, cwd: "C:/work" },
    label: paneId,
    accentColor: null,
    popoutId,
    originId,
    busy: false,
  };
}

describe("PopoutRegistry", () => {
  it("finds an entry by pane, session and pop-out window", () => {
    const r = new PopoutRegistry();
    r.add(entry("p1", 10, 1));
    assert.equal(r.byPane("p1")?.popoutId, 10);
    assert.equal(r.bySession("s-p1")?.pane.id, "p1");
    assert.equal(r.byPopout(10)?.pane.id, "p1");
    assert.equal(r.byPane("nope"), null);
    assert.equal(r.bySession("nope"), null);
    assert.equal(r.byPopout(99), null);
  });

  it("lists every pop-out of one origin window", () => {
    const r = new PopoutRegistry();
    r.add(entry("p1", 10, 1));
    r.add(entry("p2", 11, 1));
    r.add(entry("p3", 12, 2));
    assert.deepEqual(
      r
        .byOrigin(1)
        .map((e) => e.pane.id)
        .sort(),
      ["p1", "p2"],
    );
    assert.deepEqual(r.byOrigin(3), []);
  });

  it("remove returns the entry once", () => {
    const r = new PopoutRegistry();
    r.add(entry("p1", 10, 1));
    assert.equal(r.remove("p1")?.pane.id, "p1");
    assert.equal(r.remove("p1"), null);
    assert.equal(r.all().length, 0);
  });

  it("accepts busy reports only from the origin window", () => {
    const r = new PopoutRegistry();
    r.add(entry("p1", 10, 1));
    assert.equal(r.setBusy("p1", true, 10), false);
    assert.equal(r.byPane("p1")?.busy, false);
    assert.equal(r.setBusy("p1", true, 1), true);
    assert.equal(r.byPane("p1")?.busy, true);
    assert.equal(r.setBusy("missing", true, 1), false);
  });

  it("tracks cwd changes reported by the pop-out", () => {
    const r = new PopoutRegistry();
    r.add(entry("p1", 10, 1));
    r.updateCwd("p1", "D:/other");
    assert.equal(r.byPane("p1")?.pane.cwd, "D:/other");
  });
});
