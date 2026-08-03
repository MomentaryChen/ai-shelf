import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  previousTerminalFocus,
  pushTerminalFocusMru,
  type TerminalFocusRef,
} from "./terminal-focus-mru.js";

function ref(workspaceId: string, profileId: string, paneId: string): TerminalFocusRef {
  return { workspaceId, profileId, paneId };
}

describe("terminal-focus-mru", () => {
  it("returns the previous live terminal across workspaces", () => {
    const a = ref("ws-a", "p1", "pane-1");
    const b = ref("ws-b", "p2", "pane-2");
    const mru = pushTerminalFocusMru(pushTerminalFocusMru([], a), b);
    const live = new Set(["ws-a:p1:pane-1", "ws-b:p2:pane-2"]);
    const prev = previousTerminalFocus(mru, b, (r) =>
      live.has(`${r.workspaceId}:${r.profileId}:${r.paneId}`),
    );
    assert.deepEqual(prev, a);
  });

  it("skips dead entries so a live terminal in another workspace wins", () => {
    const dead = ref("ws-a", "p1", "gone");
    const liveOther = ref("ws-b", "p2", "pane-2");
    const current = ref("ws-c", "p3", "pane-3");
    const mru = [current, dead, liveOther];
    const prev = previousTerminalFocus(mru, current, (r) => r.paneId !== "gone");
    assert.deepEqual(prev, liveOther);
  });
});
