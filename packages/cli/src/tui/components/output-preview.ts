import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import { stripAnsi } from "../../shared/strip-ansi.js";

export function createOutputPreview(
  parent: Widgets.Node,
  top: number,
): Widgets.BoxElement {
  return blessed.box({
    parent,
    top,
    left: 0,
    width: "100%-1",
    bottom: 0,
    border: { type: "line" },
    label: " Output Preview ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    style: { border: { fg: "yellow" } },
    content: "{gray-fg}PTY output appears here when session is running{/}",
  });
}

export function updateOutputPreview(
  box: Widgets.BoxElement,
  raw: string,
  running: boolean,
): void {
  if (!raw) {
    box.setContent(
      running
        ? "{gray-fg}(waiting for output…){/}"
        : "{gray-fg}Start session with [s] to see output{/}",
    );
    return;
  }

  const text = stripAnsi(raw);
  const lines = text.split(/\r?\n/);
  const tail = lines.slice(-80).join("\n");
  box.setContent(tail);
  box.setScrollPerc(100);
}
