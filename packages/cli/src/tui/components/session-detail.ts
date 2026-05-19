import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { SessionModel } from "../../models/session.js";

export function createSessionDetail(parent: Widgets.Node, height: number | string = 14): Widgets.BoxElement {
  return blessed.box({
    parent,
    top: 0,
    left: 0,
    width: "100%-1",
    height,
    border: { type: "line" },
    label: " Session Detail ",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: { border: { fg: "magenta" } },
    content: "{gray-fg}Select a session to view details{/}",
  });
}

export function updateSessionDetail(box: Widgets.BoxElement, session: SessionModel | null): void {
  if (!session) {
    box.setContent("{gray-fg}Select a session to view details{/}");
    return;
  }

  box.setContent(
    [
      `{bold}${session.name}{/bold}`,
      "",
      `{cyan-fg}Status:{/}  ${session.status}`,
      `{cyan-fg}CWD:{/}     ${session.cwd}`,
      `{cyan-fg}Shell:{/}   ${session.shell}`,
      `{cyan-fg}Tool:{/}    ${session.tool ?? "—"}`,
      `{cyan-fg}PID:{/}     ${session.pid ?? "—"}`,
      "",
      `{gray-fg}Created:{/} ${session.created_at}`,
      `{gray-fg}Updated:{/} ${session.updated_at}`,
    ].join("\n"),
  );
}
