import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPaneShortcutAction,
  matchPaneShortcut,
  shouldConsumePaneShortcut,
  type PaneShortcutHandlers,
} from "./pane-shortcuts.js";
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
    assert.equal(
      shouldConsumePaneShortcut({ type: "close" }, { panes: [pane("a")] }),
      true,
    );
  });
});

/** Minimal HTMLElement stand-in: node:test has no DOM. */
class FakeElement {
  tagName: string;
  isContentEditable = false;
  constructor(
    tagName: string,
    private readonly ancestors: string[] = [],
  ) {
    this.tagName = tagName;
  }
  closest(selector: string): FakeElement | null {
    return this.ancestors.includes(selector) ? this : null;
  }
}
(globalThis as { HTMLElement?: unknown }).HTMLElement ??= FakeElement;

function keydown(
  key: string,
  target: FakeElement,
  mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = { ctrl: true },
): KeyboardEvent {
  return {
    type: "keydown",
    key,
    ctrlKey: Boolean(mods.ctrl),
    metaKey: Boolean(mods.meta),
    shiftKey: Boolean(mods.shift),
    altKey: false,
    target,
  } as unknown as KeyboardEvent;
}

describe("matchPaneShortcut close", () => {
  const xtermTextarea = () => new FakeElement("TEXTAREA", [".xterm"]);
  const sidebarButton = () => new FakeElement("BUTTON");

  it("passes Ctrl+W through to the shell inside xterm", () => {
    assert.equal(matchPaneShortcut(keydown("w", xtermTextarea())), null);
  });

  it("closes the pane with Ctrl+Shift+W inside xterm", () => {
    assert.deepEqual(
      matchPaneShortcut(keydown("W", xtermTextarea(), { ctrl: true, shift: true })),
      { type: "close" },
    );
  });

  it("keeps Cmd+W as close inside xterm (macOS)", () => {
    assert.deepEqual(matchPaneShortcut(keydown("w", xtermTextarea(), { meta: true })), {
      type: "close",
    });
  });

  it("keeps Ctrl+W as close outside xterm", () => {
    assert.deepEqual(matchPaneShortcut(keydown("w", sidebarButton())), { type: "close" });
  });

  it("still ignores Ctrl+W in form inputs", () => {
    assert.equal(matchPaneShortcut(keydown("w", new FakeElement("INPUT"))), null);
  });

  it("keeps Ctrl+L as clear-screen inside xterm", () => {
    assert.deepEqual(matchPaneShortcut(keydown("l", xtermTextarea())), {
      type: "clear-screen",
    });
  });
});
