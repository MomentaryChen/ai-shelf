import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { SessionModel } from "../../models/session.js";

export function createSessionList(parent: Widgets.Node): Widgets.ListElement {
  return blessed.list({
    parent,
    top: 1,
    left: 0,
    width: "100%-1",
    height: "100%-1",
    border: { type: "line" },
    label: " Sessions ",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      border: { fg: "green" },
      selected: { bg: "green", fg: "black" },
    },
    items: ["{yellow-fg}Select a group{/}"],
  });
}

export function updateSessionList(list: Widgets.ListElement, sessions: SessionModel[]): void {
  if (sessions.length === 0) {
    list.setItems(["{gray-fg}(no sessions){/}"]);
  } else {
    list.setItems(
      sessions.map(
        (s) => `{cyan-fg}${s.name}{/}  {gray-fg}${s.status}{/}`,
      ),
    );
  }
  list.select(0);
}
