import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPaneShortcutAction,
  matchPaneShortcutWithBindings,
  shouldConsumePaneShortcut,
  type PaneShortcutHandlers,
} from "./pane-shortcuts.js";
import { resolveKeybindings, type KeyEventLike } from "../shortcuts/keybindings.js";
import type { PaneInfo } from "./split-tree.js";

function pane(id: string): PaneInfo {
  return {
    id,
    sessionId: `s-${id}`,
    tool: "shell",
    cwd: "",
  };
}

function handlers(partial: Partial<PaneShortcutHandlers> = {}): PaneShortcutHandlers {
  return {
    panes: [],
    focusedPaneId: null,
    onFocusPane: () => undefined,
    onClosePane: () => undefined,
    onSplitPane: () => undefined,
    ...partial,
  };
}

describe("applyPaneShortcutAction", () => {
  it("runs Ctrl+Tab MRU even when the current workspace has no panes", () => {
    let called = 0;
    applyPaneShortcutAction(
      { type: "focus-next" },
      handlers({
        panes: [],
        onFocusRecentTerminal: () => {
          called += 1;
        },
      }),
    );
    assert.equal(called, 1);
  });

  it("does not run other shortcuts when panes are empty", () => {
    let closed = 0;
    applyPaneShortcutAction(
      { type: "close" },
      handlers({
        panes: [],
        onClosePane: () => {
          closed += 1;
        },
      }),
    );
    assert.equal(closed, 0);
  });

  it("falls back to cycling local panes when MRU handler is absent", () => {
    const focused: string[] = [];
    applyPaneShortcutAction(
      { type: "focus-next" },
      handlers({
        panes: [pane("a"), pane("b")],
        focusedPaneId: "a",
        onFocusPane: (id) => focused.push(id),
      }),
    );
    assert.deepEqual(focused, ["b"]);
  });
});

describe("shouldConsumePaneShortcut", () => {
  it("allows Ctrl+Tab MRU with zero panes", () => {
    assert.equal(
      shouldConsumePaneShortcut(
        { type: "focus-next" },
        { panes: [], onFocusRecentTerminal: () => undefined },
      ),
      true,
    );
  });

  it("blocks Ctrl+W and focus-index when panes are empty", () => {
    const h = { panes: [] as PaneInfo[], onFocusRecentTerminal: () => undefined };
    assert.equal(shouldConsumePaneShortcut({ type: "close" }, h), false);
    assert.equal(shouldConsumePaneShortcut({ type: "focus-index", index: 0 }, h), false);
  });

  it("allows normal pane shortcuts when panes exist", () => {
    assert.equal(shouldConsumePaneShortcut({ type: "close" }, { panes: [pane("a")] }), true);
  });
});

/** Minimal element stand-in: node:test has no DOM. `closest` is enough for xterm detection. */
function fakeTarget(ancestors: string[] = []): EventTarget {
  return {
    closest(selector: string) {
      return ancestors.includes(selector) ? this : null;
    },
  } as unknown as EventTarget;
}

describe("matchPaneShortcutWithBindings", () => {
  const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
    type: "keydown",
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });
  const xterm = () => fakeTarget([".xterm"]);

  it("maps default bindings to pane actions", () => {
    const map = resolveKeybindings({}, "win");
    assert.deepEqual(matchPaneShortcutWithBindings(key("w", { ctrlKey: true }), map), {
      type: "close",
    });
    assert.deepEqual(
      matchPaneShortcutWithBindings(key("4", { ctrlKey: true, code: "Digit4" }), map),
      { type: "focus-index", index: 3 },
    );
    assert.deepEqual(
      matchPaneShortcutWithBindings(key("|", { ctrlKey: true, shiftKey: true }), map),
      { type: "split", direction: "vertical" },
    );
  });

  it("lets Ctrl+W reach the terminal when close is unbound", () => {
    const map = resolveKeybindings({ closePane: null }, "win");
    assert.equal(matchPaneShortcutWithBindings(key("w", { ctrlKey: true }), map), null);
    assert.equal(matchPaneShortcutWithBindings(key("w", { ctrlKey: true }), map, xterm()), null);
  });

  it("supports Alt-based rebinding", () => {
    const map = resolveKeybindings({ closePane: { key: "w", alt: true, shift: true } }, "win");
    assert.deepEqual(
      matchPaneShortcutWithBindings(key("W", { altKey: true, shiftKey: true, code: "KeyW" }), map),
      { type: "close" },
    );
    assert.deepEqual(
      matchPaneShortcutWithBindings(
        key("W", { altKey: true, shiftKey: true, code: "KeyW" }),
        map,
        xterm(),
      ),
      { type: "close" },
    );
  });

  it("passes plain Ctrl+W through to the shell inside xterm", () => {
    const map = resolveKeybindings({}, "win");
    assert.equal(matchPaneShortcutWithBindings(key("w", { ctrlKey: true }), map, xterm()), null);
  });

  it("closes the pane with Ctrl+Shift+W, including inside xterm", () => {
    const map = resolveKeybindings({}, "win");
    const chord = key("W", { ctrlKey: true, shiftKey: true });
    assert.deepEqual(matchPaneShortcutWithBindings(chord, map), { type: "close" });
    assert.deepEqual(matchPaneShortcutWithBindings(chord, map, xterm()), { type: "close" });
  });

  it("keeps Cmd+W as close inside xterm", () => {
    const map = resolveKeybindings({}, "mac");
    assert.deepEqual(matchPaneShortcutWithBindings(key("w", { metaKey: true }), map, xterm()), {
      type: "close",
    });
  });

  it("keeps Ctrl+L as clear-screen inside xterm", () => {
    const map = resolveKeybindings({}, "win");
    assert.deepEqual(matchPaneShortcutWithBindings(key("l", { ctrlKey: true }), map, xterm()), {
      type: "clear-screen",
    });
  });
});
