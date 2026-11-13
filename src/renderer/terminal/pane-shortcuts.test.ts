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

  it("opens command history with Ctrl+Shift+H only when a handler is registered", () => {
    const map = resolveKeybindings({}, "win");
    const action = matchPaneShortcutWithBindings(key("H", { ctrlKey: true, shiftKey: true }), map, xterm());
    assert.deepEqual(action, { type: "command-history" });
    assert.equal(shouldConsumePaneShortcut(action!, { panes: [pane("a")] }), false);
    let opened = 0;
    const h = handlers({ panes: [pane("a")], onOpenCommandHistory: () => (opened += 1) });
    assert.equal(shouldConsumePaneShortcut(action!, h), true);
    applyPaneShortcutAction(action!, h);
    assert.equal(opened, 1);
  });

  it("maps swap / resize / equalize defaults and needs several panes", () => {
    const map = resolveKeybindings({}, "win");
    const swap = matchPaneShortcutWithBindings(
      key("ArrowLeft", { ctrlKey: true, altKey: true, shiftKey: true }),
      map,
      xterm(),
    );
    assert.deepEqual(swap, { type: "swap-pane", direction: "left" });
    const resize = matchPaneShortcutWithBindings(
      key("ArrowDown", { altKey: true, shiftKey: true }),
      map,
      xterm(),
    );
    assert.deepEqual(resize, { type: "resize-pane", direction: "down" });
    const equalize = matchPaneShortcutWithBindings(
      key("+", { altKey: true, shiftKey: true, code: "Equal" }),
      map,
      xterm(),
    );
    assert.deepEqual(equalize, { type: "equalize-panes" });

    const calls: string[] = [];
    const multi = handlers({
      panes: [pane("a"), pane("b")],
      focusedPaneId: "b",
      onSwapPane: (id, d) => calls.push(`swap ${id} ${d}`),
      onResizePane: (id, d) => calls.push(`resize ${id} ${d}`),
      onEqualizePanes: () => calls.push("equalize"),
    });
    for (const a of [swap!, resize!, equalize!]) {
      assert.equal(shouldConsumePaneShortcut(a, multi), true);
      assert.equal(shouldConsumePaneShortcut(a, { ...multi, panes: [pane("a")] }), false);
      applyPaneShortcutAction(a, multi);
    }
    assert.deepEqual(calls, ["swap b left", "resize b down", "equalize"]);
  });
});

describe("font zoom shortcuts", () => {
  const map = resolveKeybindings({}, "win");
  const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
    type: "keydown",
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it("maps Ctrl+= / Ctrl+- / Ctrl+0", () => {
    assert.deepEqual(matchPaneShortcutWithBindings(key("=", { ctrlKey: true, code: "Equal" }), map), {
      type: "font-zoom",
      direction: "in",
    });
    assert.deepEqual(matchPaneShortcutWithBindings(key("-", { ctrlKey: true, code: "Minus" }), map), {
      type: "font-zoom",
      direction: "out",
    });
    assert.deepEqual(matchPaneShortcutWithBindings(key("0", { ctrlKey: true, code: "Digit0" }), map), {
      type: "font-zoom",
      direction: "reset",
    });
  });

  it("accepts Ctrl++ (Shift+= or numpad +) for the default zoom-in", () => {
    const plus = key("+", { ctrlKey: true, shiftKey: true, code: "Equal" });
    assert.deepEqual(matchPaneShortcutWithBindings(plus, map), { type: "font-zoom", direction: "in" });
    const numpad = key("+", { ctrlKey: true, code: "NumpadAdd" });
    assert.deepEqual(matchPaneShortcutWithBindings(numpad, map), { type: "font-zoom", direction: "in" });
  });

  it("does not consume zoom keys without a zoom handler", () => {
    const action = { type: "font-zoom", direction: "in" } as const;
    assert.equal(shouldConsumePaneShortcut(action, { panes: [pane("a")] }), false);
    assert.equal(
      shouldConsumePaneShortcut(action, { panes: [pane("a")], onFontZoom: () => undefined }),
      true,
    );
  });

  it("maps Ctrl+Shift+Enter to toggle maximize for the focused pane", () => {
    const chord = key("Enter", { ctrlKey: true, shiftKey: true, code: "Enter" });
    assert.deepEqual(matchPaneShortcutWithBindings(chord, map), { type: "toggle-maximize" });
    const seen: string[] = [];
    applyPaneShortcutAction(
      { type: "toggle-maximize" },
      handlers({ panes: [pane("a"), pane("b")], focusedPaneId: "b", onToggleMaximizePane: (id) => seen.push(id) }),
    );
    assert.deepEqual(seen, ["b"]);
    assert.equal(shouldConsumePaneShortcut({ type: "toggle-maximize" }, { panes: [pane("a")] }), false);
  });

  it("runs the zoom handler", () => {
    const seen: string[] = [];
    applyPaneShortcutAction(
      { type: "font-zoom", direction: "out" },
      handlers({ panes: [pane("a")], onFontZoom: (d) => seen.push(d) }),
    );
    assert.deepEqual(seen, ["out"]);
  });
});
