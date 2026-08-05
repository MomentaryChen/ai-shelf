import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPin, type PinnableElement } from "./ime-pin.js";

/** Minimal stand-in for an element's inline style, recording every write. */
function element(left = "", top = ""): PinnableElement & { writes: string[] } {
  const style = {
    left,
    top,
    setProperty(property: string, value: string, priority?: string) {
      (style as unknown as Record<string, string>)[property] = value;
      writes.push(`${property}:${value}${priority ? ` !${priority}` : ""}`);
    },
  };
  const writes: string[] = [];
  return { style, writes };
}

describe("applyPin", () => {
  it("writes both coordinates with !important", () => {
    const el = element();
    assert.equal(applyPin([el], { left: "40px", top: "90px" }), 1);
    assert.deepEqual(el.writes, ["left:40px !important", "top:90px !important"]);
    assert.equal(el.style.left, "40px");
    assert.equal(el.style.top, "90px");
  });

  it("skips an element already on the pin, so observer loops settle", () => {
    const el = element("40px", "90px");
    assert.equal(applyPin([el], { left: "40px", top: "90px" }), 0);
    assert.deepEqual(el.writes, []);
  });

  // Regression: the anchor used to cache the *intended* position and skip the
  // write when it had not changed. xterm moves the helper elements from render,
  // cursor-move and compositionstart callbacks — and while a pane is blurred
  // nothing pushes back — so an unchanged intent says nothing about where the
  // element actually is. The first composition after a window switch then
  // latched the IME onto xterm's hardware-cursor position.
  it("re-writes an element that drifted even though the pin is unchanged", () => {
    const pin = { left: "40px", top: "90px" };
    const el = element();
    applyPin([el], pin);
    el.writes.length = 0;

    // xterm's _syncTextArea drags it onto the hardware cursor.
    (el.style as { left: string }).left = "0px";
    (el.style as { top: string }).top = "0px";

    assert.equal(applyPin([el], pin), 1);
    assert.equal(el.style.left, "40px");
    assert.equal(el.style.top, "90px");
  });

  it("corrects a fractional value xterm wrote for the same cell", () => {
    const el = element("39.6px", "90px");
    assert.equal(applyPin([el], { left: "40px", top: "90px" }), 1);
  });

  it("reports how many of several elements needed correcting", () => {
    const pin = { left: "40px", top: "90px" };
    const onPin = element("40px", "90px");
    const drifted = element("40px", "0px");
    assert.equal(applyPin([onPin, drifted], pin), 1);
    assert.deepEqual(onPin.writes, []);
    assert.equal(drifted.style.top, "90px");
  });
});
