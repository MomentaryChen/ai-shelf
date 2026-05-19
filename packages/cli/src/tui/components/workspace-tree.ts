import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { WorkspaceModel } from "../../models/workspace.js";
import type { GroupModel } from "../../models/group.js";

export interface WorkspaceTreeData {
  workspaces: WorkspaceModel[];
  groupsByWorkspace: Map<string, GroupModel[]>;
}

export function createWorkspaceTree(
  parent: Widgets.Node,
  data: WorkspaceTreeData,
  onSelect: (workspaceName: string, groupName?: string) => void,
): Widgets.ListElement {
  const items = buildTreeItems(data);

  const list = blessed.list({
    parent,
    top: 1,
    left: 0,
    width: "100%-1",
    height: "100%-1",
    border: { type: "line" },
    label: " Workspaces ",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      border: { fg: "cyan" },
      selected: { bg: "blue", fg: "white" },
      item: { fg: "white" },
    },
    items,
  });

  list.on("select", (_item, index) => {
    const parsed = parseTreeIndex(data, index);
    if (parsed) onSelect(parsed.workspaceName, parsed.groupName);
  });

  return list;
}

export function updateWorkspaceTree(list: Widgets.ListElement, data: WorkspaceTreeData): void {
  list.setItems(buildTreeItems(data));
  list.select(0);
}

function buildTreeItems(data: WorkspaceTreeData): string[] {
  const items: string[] = [];
  for (const ws of data.workspaces) {
    items.push(`{cyan-fg}${ws.name}{/}`);
    const groups = data.groupsByWorkspace.get(ws.id) ?? [];
    for (const g of groups) {
      items.push(`  {gray-fg}└ {/}{white-fg}${g.name}{/}`);
    }
  }
  if (items.length === 0) {
    items.push("{yellow-fg}(no workspaces){/}");
  }
  return items;
}

function parseTreeIndex(
  data: WorkspaceTreeData,
  index: number,
): { workspaceName: string; groupName?: string } | null {
  let i = 0;
  for (const ws of data.workspaces) {
    if (i === index) return { workspaceName: ws.name };
    i++;
    const groups = data.groupsByWorkspace.get(ws.id) ?? [];
    for (const g of groups) {
      if (i === index) return { workspaceName: ws.name, groupName: g.name };
      i++;
    }
  }
  return null;
}
