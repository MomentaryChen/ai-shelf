import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import { APP_TITLE } from "../../config/config.js";

export function createStatusBar(parent: Widgets.Node): Widgets.BoxElement {
  return blessed.box({
    parent,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "white", bg: "blue" },
    content: ` ${APP_TITLE}  |  [q] quit  [r] refresh  [s] start  [x] stop  [e] exec  [B] broadcast  [Tab] sessions`,
  });
}

export function setStatusMessage(bar: Widgets.BoxElement, message: string): void {
  bar.setContent(
    ` ${APP_TITLE}  |  ${message}  |  [q] quit  [r] refresh`,
  );
}
