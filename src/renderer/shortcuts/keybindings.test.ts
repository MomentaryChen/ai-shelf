import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIGIT_KEY,
  combosOverlap,
  defaultKeybindings,
  findKeybindingConflicts,
  formatCombo,
  keyFromCode,
  matchCombo,
  matchShortcut,
  migrateLegacyPaneShortcuts,
  normalizeKeybindingOverrides,
  recordComboFromEvent,
  resetKeybindingOverride,
  resolveKeybindings,
  setKeybindingOverride,
  type KeyEventLike,
} from "./keybindings.js";

function ev(key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    type: "keydown",
    key,
    code: mods.code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  };
}

describe("matchCombo", () => {
  it("matches Ctrl or Cmd for `mod` combos", () => {
    const combo = { key: "w", mod: true };
    assert.ok(matchCombo(ev("w", { ctrlKey: true }), combo));
    assert.ok(matchCombo(ev("w", { metaKey: true }), combo));
    assert.equal(matchCombo(ev("w"), combo), false);
  });

  it("requires exact Shift / Alt state", () => {
    const combo = { key: "r", mod: true, shift: true };
    assert.ok(matchCombo(ev("R", { ctrlKey: true, shiftKey: true }), combo));
    assert.equal(matchCombo(ev("r", { ctrlKey: true }), combo), false);
    assert.equal(matchCombo(ev("R", { ctrlKey: true, shiftKey: true, altKey: true }), combo), false);
  });

  it("strict meta combos ignore Ctrl (mac Cmd+A select all vs Ctrl+A line start)", () => {
    const combo = { key: "a", meta: true };
    assert.ok(matchCombo(ev("a", { metaKey: true }), combo));
    assert.equal(matchCombo(ev("a", { ctrlKey: true }), combo), false);
  });

  it("treats | as \\ for split shortcuts", () => {
    const combo = { key: "\\", mod: true, shift: true };
    assert.ok(matchCombo(ev("|", { ctrlKey: true, shiftKey: true, code: "Backslash" }), combo));
  });

  it("uses the physical code when Alt / Shift change the glyph", () => {
    // macOS Option+1 produces "¡"
    assert.ok(matchCombo(ev("¡", { altKey: true, code: "Digit1" }), { key: "1", alt: true }));
    // Ctrl+Shift+/ produces "?"
    assert.ok(
      matchCombo(ev("?", { ctrlKey: true, shiftKey: true, code: "Slash" }), {
        key: "/",
        mod: true,
        shift: true,
      }),
    );
  });

  it("does not use letter codes without Alt (non-QWERTY layouts keep their letters)", () => {
    // AZERTY: physical KeyQ types "a"
    assert.equal(matchCombo(ev("a", { ctrlKey: true, code: "KeyQ" }), { key: "q", mod: true }), false);
    assert.ok(matchCombo(ev("a", { ctrlKey: true, code: "KeyQ" }), { key: "a", mod: true }));
  });

  it("returns the 0-based index for digit combos", () => {
    const combo = { key: DIGIT_KEY, mod: true };
    assert.deepEqual(matchCombo(ev("3", { ctrlKey: true, code: "Digit3" }), combo), { index: 2 });
    assert.equal(matchCombo(ev("0", { ctrlKey: true, code: "Digit0" }), combo), false);
    // Ctrl+Shift+1 reports "!" — still index 0 via code
    assert.deepEqual(
      matchCombo(ev("!", { ctrlKey: true, shiftKey: true, code: "Digit1" }), {
        key: DIGIT_KEY,
        mod: true,
        shift: true,
      }),
      { index: 0 },
    );
  });

  it("never matches unbound shortcuts or keyup", () => {
    assert.equal(matchCombo(ev("w", { ctrlKey: true }), null), false);
    assert.equal(
      matchCombo(ev("w", { ctrlKey: true, type: "keyup" }), { key: "w", mod: true }),
      false,
    );
  });
});

describe("matchShortcut / resolveKeybindings", () => {
  it("defaults keep the previous hard-coded shortcuts", () => {
    const map = resolveKeybindings({}, "win");
    assert.equal(matchShortcut(ev("w", { ctrlKey: true }), map)?.id, "closePane");
    assert.equal(matchShortcut(ev("k", { ctrlKey: true }), map)?.id, "commandPalette");
    assert.equal(matchShortcut(ev("/", { ctrlKey: true }), map)?.id, "cheatsheet");
    assert.equal(
      matchShortcut(ev("2", { altKey: true, code: "Digit2" }), map)?.id,
      "modeInventory",
    );
    assert.equal(matchShortcut(ev("Tab", { ctrlKey: true }), map)?.id, "focusNext");
  });

  it("unbinding lets the key pass through", () => {
    const map = resolveKeybindings({ closePane: null, commandPalette: null }, "win");
    assert.equal(matchShortcut(ev("w", { ctrlKey: true }), map), null);
    assert.equal(matchShortcut(ev("k", { ctrlKey: true }), map), null);
  });

  it("rebinding moves the shortcut", () => {
    const map = resolveKeybindings({ closePane: { key: "w", mod: true, shift: true } }, "win");
    assert.equal(matchShortcut(ev("w", { ctrlKey: true }), map), null);
    assert.equal(matchShortcut(ev("W", { ctrlKey: true, shiftKey: true }), map)?.id, "closePane");
  });

  it("respects the id filter order", () => {
    const map = resolveKeybindings({}, "win");
    assert.equal(
      matchShortcut(ev("1", { ctrlKey: true, code: "Digit1" }), map, ["profileByIndex"])?.index,
      0,
    );
  });

  it("platform select-all defaults", () => {
    assert.deepEqual(defaultKeybindings("mac").selectAll, { key: "a", meta: true });
    assert.deepEqual(defaultKeybindings("win").selectAll, { key: "a", mod: true });
    assert.deepEqual(defaultKeybindings("linux").selectAll, { key: "a", mod: true, shift: true });
  });
});

describe("overrides", () => {
  it("setting the default value removes the override", () => {
    const o = setKeybindingOverride({ closePane: null }, "closePane", { key: "w", mod: true }, "win");
    assert.deepEqual(o, {});
  });

  it("stores null for disabled and resets per id", () => {
    const o = setKeybindingOverride({}, "find", null, "win");
    assert.deepEqual(o, { find: null });
    assert.deepEqual(resetKeybindingOverride(o, "find"), {});
  });

  it("normalizes stored overrides", () => {
    const o = normalizeKeybindingOverrides({
      closePane: null,
      find: { key: " F ", mod: true, shift: "yes" },
      bogus: { key: "x", mod: true },
      copy: { key: "shift", mod: true },
      focusPane: { key: "1", mod: true }, // digit family needs the wildcard
      profileByIndex: { key: DIGIT_KEY, alt: true },
    });
    assert.deepEqual(o, {
      closePane: null,
      find: { key: "f", mod: true },
      profileByIndex: { key: DIGIT_KEY, alt: true },
    });
  });

  it("migrates legacy paneShortcuts settings", () => {
    assert.deepEqual(
      migrateLegacyPaneShortcuts({
        focusNext: { key: "tab" },
        focusPrev: { key: "tab", shift: true },
        splitHorizontal: { key: "d" },
        splitVertical: { key: "|", shift: true },
        focusPane: { shift: true },
      }),
      {
        splitHorizontal: { key: "d", mod: true },
        focusPane: { key: DIGIT_KEY, mod: true, shift: true },
      },
    );
    assert.deepEqual(migrateLegacyPaneShortcuts(undefined), {});
  });
});

describe("recordComboFromEvent", () => {
  it("records modifier combos", () => {
    assert.deepEqual(recordComboFromEvent(ev("j", { ctrlKey: true })), {
      kind: "combo",
      combo: { key: "j", mod: true },
    });
    assert.deepEqual(recordComboFromEvent(ev("?", { metaKey: true, shiftKey: true, code: "Slash" })), {
      kind: "combo",
      combo: { key: "/", mod: true, shift: true },
    });
  });

  it("waits on modifier-only presses, cancels on Esc, rejects bare keys", () => {
    assert.equal(recordComboFromEvent(ev("Control", { ctrlKey: true })).kind, "pending");
    assert.equal(recordComboFromEvent(ev("Escape")).kind, "cancel");
    assert.equal(recordComboFromEvent(ev("w")).kind, "invalid");
    assert.equal(recordComboFromEvent(ev("F5")).kind, "combo");
  });

  it("records the digit wildcard for digit-family shortcuts", () => {
    assert.deepEqual(recordComboFromEvent(ev("¡", { altKey: true, code: "Digit1" }), true), {
      kind: "combo",
      combo: { key: DIGIT_KEY, alt: true },
    });
    assert.equal(recordComboFromEvent(ev("k", { ctrlKey: true }), true).kind, "invalid");
  });
});

describe("conflicts", () => {
  it("default bindings have no conflicts on any platform", () => {
    for (const p of ["mac", "win", "linux"] as const) {
      assert.equal(findKeybindingConflicts(defaultKeybindings(p)).size, 0, p);
    }
  });

  it("detects duplicate combos in both directions", () => {
    const map = resolveKeybindings({ find: { key: "k", mod: true } }, "win");
    const c = findKeybindingConflicts(map);
    assert.deepEqual(c.get("find"), ["commandPalette"]);
    assert.deepEqual(c.get("commandPalette"), ["find"]);
  });

  it("digit wildcard overlaps a single digit; mod overlaps strict ctrl/meta", () => {
    assert.ok(combosOverlap({ key: DIGIT_KEY, alt: true }, { key: "3", alt: true }));
    assert.ok(combosOverlap({ key: "a", mod: true }, { key: "a", meta: true }));
    assert.equal(combosOverlap({ key: "a", ctrl: true }, { key: "a", meta: true }), false);
    assert.equal(combosOverlap({ key: "a", mod: true }, { key: "a", mod: true, shift: true }), false);
    assert.equal(combosOverlap(null, { key: "a", mod: true }), false);
  });

  it("mode digits clash with a remapped digit-family shortcut", () => {
    const map = resolveKeybindings({ focusPane: { key: DIGIT_KEY, alt: true } }, "win");
    const c = findKeybindingConflicts(map);
    assert.deepEqual(c.get("focusPane"), ["modeTerminal", "modeInventory", "modeTools", "modeFlow"]);
  });
});

describe("display helpers", () => {
  it("formats combos per platform", () => {
    assert.equal(formatCombo({ key: "\\", mod: true, shift: true }, "win"), "Ctrl+Shift+\\");
    assert.equal(formatCombo({ key: "1", alt: true }, "mac"), "Option+1");
    assert.equal(formatCombo({ key: DIGIT_KEY, mod: true }, "mac"), "Cmd+1–9");
    assert.equal(formatCombo({ key: "tab", mod: true }, "linux"), "Ctrl+Tab");
    assert.equal(formatCombo(null, "win"), "");
  });

  it("maps codes to keys", () => {
    assert.equal(keyFromCode("Digit7"), "7");
    assert.equal(keyFromCode("KeyZ"), "z");
    assert.equal(keyFromCode("Backquote"), "`");
    assert.equal(keyFromCode("ShiftLeft"), null);
  });
});
