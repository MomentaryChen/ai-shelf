import type { Command } from "../components/CommandPalette";
import type { MessageKey } from "../i18n/messages/en";
import type { ProviderEntry } from "../types";
import { toolLabel } from "../utils";

type TabId = "overview" | "models" | "skills" | "mcp" | "config" | "doctor" | "update" | "usage";

/** Inventory-side palette entries (tools, config, skills, MCP) — always merged into Cmd+K. */
export function buildGlobalSearchCommands(
  data: ProviderEntry[],
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  goTo: (tab: TabId) => void,
): Command[] {
  const basename = (p: string) => p.split(/[\\/]/).pop() || p;

  const toolCommands: Command[] = data.map((entry) => ({
    id: `find-tool-${entry.tool}`,
    title: t("cmd.toolSearch", { name: toolLabel(entry.tool) }),
    group: t("cmd.group.tools"),
    icon: entry.available ? "🛠️" : "📦",
    keywords: `${entry.tool} cli inventory tool ${toolLabel(entry.tool)}`,
    hideWhenEmpty: true,
    run: () => goTo("overview"),
  }));

  const configSeen = new Set<string>();
  const configCommands: Command[] = [];
  for (const entry of data) {
    const paths = [...entry.config.paths, ...entry.config.instructionFiles, ...entry.mcp.configPaths];
    for (const path of paths) {
      if (configSeen.has(path)) continue;
      configSeen.add(path);
      configCommands.push({
        id: `open-config-${path}`,
        title: t("cmd.openConfig", { name: basename(path) }),
        group: t("cmd.group.config"),
        icon: "📄",
        keywords: `${entry.tool} config ${path}`,
        hideWhenEmpty: true,
        run: () => void window.api.openPath(path),
      });
    }
  }

  const skillSeen = new Set<string>();
  const skillCommands: Command[] = [];
  for (const entry of data) {
    for (const skill of entry.skills) {
      if (skillSeen.has(skill)) continue;
      skillSeen.add(skill);
      skillCommands.push({
        id: `find-skill-${skill}`,
        title: t("cmd.skillSearch", { name: skill }),
        group: t("cmd.group.skills"),
        icon: "⚡",
        keywords: `skill ${skill}`,
        hideWhenEmpty: true,
        run: () => goTo("skills"),
      });
    }
  }

  const mcpSeen = new Set<string>();
  const mcpCommands: Command[] = [];
  for (const entry of data) {
    for (const server of entry.mcp.servers) {
      if (mcpSeen.has(server)) continue;
      mcpSeen.add(server);
      mcpCommands.push({
        id: `find-mcp-${server}`,
        title: t("cmd.mcpSearch", { name: server }),
        group: t("cmd.group.mcp"),
        icon: "🔌",
        keywords: `mcp server ${server}`,
        hideWhenEmpty: true,
        run: () => goTo("mcp"),
      });
    }
  }

  return [...toolCommands, ...configCommands, ...skillCommands, ...mcpCommands];
}

/** Dedupe by command id; earlier arrays win on collision. */
export function mergePaletteCommands(...groups: Command[][]): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  for (const group of groups) {
    for (const command of group) {
      if (seen.has(command.id)) continue;
      seen.add(command.id);
      out.push(command);
    }
  }
  return out;
}
