import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { ProfileInfo } from "../../services/profile-service.js";

export interface ProfileTreeData {
  profiles: ProfileInfo[];
  lastActiveProfileId: string | null;
}

export function createProfileTree(
  parent: Widgets.Node,
  data: ProfileTreeData,
  onSelect: (profile: ProfileInfo) => void,
): Widgets.ListElement {
  const list = blessed.list({
    parent,
    top: 1,
    left: 0,
    width: "100%-1",
    height: "100%-1",
    border: { type: "line" },
    label: " Profiles ",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      border: { fg: "cyan" },
      selected: { bg: "blue", fg: "white" },
      item: { fg: "white" },
    },
    items: buildTreeItems(data),
  });

  list.on("select", (_item, index) => {
    const profile = data.profiles[index];
    if (profile) onSelect(profile);
  });

  return list;
}

export function updateProfileTree(list: Widgets.ListElement, data: ProfileTreeData): void {
  list.setItems(buildTreeItems(data));
  list.select(0);
}

function buildTreeItems(data: ProfileTreeData): string[] {
  if (data.profiles.length === 0) {
    return ["{yellow-fg}(no profiles — run: ai-shelf profile create <name>){/}"];
  }

  return data.profiles.map((p) => {
    const active = p.id === data.lastActiveProfileId ? "{green-fg}● {/}" : "  ";
    const panes =
      p.paneCount > 0 ? chalkDim(`  ${String(p.paneCount)} pane${p.paneCount === 1 ? "" : "s"}`) : "";
    const tool = `{magenta-fg} [${p.defaultTool}]{/}`;
    return `${active}{cyan-fg}${p.name}{/}${tool}${panes}`;
  });
}

function chalkDim(text: string): string {
  return `{gray-fg}${text}{/}`;
}
