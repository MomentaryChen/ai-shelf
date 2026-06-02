import blessed from "neo-blessed";
import type { Widgets } from "blessed";
import type { ProfileGroupNode, ProfileForest } from "../../services/profile-service.js";

export interface ProfileGroupTreeData {
  forest: ProfileForest;
  selectedGroupId: string | null;
}

export function createProfileGroupTree(
  parent: Widgets.Node,
  data: ProfileGroupTreeData,
  onSelect: (group: ProfileGroupNode) => void,
): Widgets.ListElement {
  const list = blessed.list({
    parent,
    top: 0,
    left: 0,
    width: "100%",
    height: "40%",
    border: { type: "line" },
    label: " Groups ",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      border: { fg: "cyan" },
      selected: { bg: "blue", fg: "white" },
      item: { fg: "white" },
    },
    items: buildGroupItems(data),
  });

  list.on("select", (_item, index) => {
    const group = data.forest.groups[index];
    if (group) onSelect(group);
  });

  return list;
}

export function updateProfileGroupTree(
  list: Widgets.ListElement,
  data: ProfileGroupTreeData,
): void {
  list.setItems(buildGroupItems(data));
}

function buildGroupItems(data: ProfileGroupTreeData): string[] {
  if (data.forest.groups.length === 0) {
    return ["{yellow-fg}(no groups){/}"];
  }
  return data.forest.groups.map((g) => {
    const active = g.id === data.selectedGroupId ? "{green-fg}● {/}" : "  ";
    const count =
      g.profiles.length > 0
        ? `{gray-fg}  ${String(g.profiles.length)} profile${g.profiles.length === 1 ? "" : "s"}{/}`
        : "";
    return `${active}{cyan-fg}${g.name}{/}${count}`;
  });
}
