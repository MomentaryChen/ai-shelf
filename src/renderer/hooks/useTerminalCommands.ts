import { useMemo } from "react";
import type { Command } from "../components/CommandPalette";
import type { ProfileForest, ProviderEntry } from "../types";
import { findProviderEntry } from "../utils/claude-cursor-diff";
import { modLabel } from "../profile-quick-switch";
import { toolLabel } from "../utils";

export interface TerminalCommandActions {
  addPane: (tool: string) => void | Promise<void>;
  openExternal: (tool: string) => void | Promise<void>;
  activateProfile: (profileId: string) => void | Promise<void>;
  /** Send a command line to every open pane (always all, regardless of broadcast toggle). */
  broadcastCommand: (text: string) => void;
}

export interface TerminalCommandOptions {
  /** Group whose profiles map to the Ctrl+1–9 quick-switch shortcuts. */
  currentGroupId: string | null;
  /** Number of open panes; the broadcast command is hidden when there are none. */
  paneCount: number;
}

export function useTerminalCommands(
  t: (key: import("../i18n/messages/en").MessageKey, params?: Record<string, string | number>) => string,
  data: ProviderEntry[],
  forest: ProfileForest | null,
  activeProfileId: string | null,
  options: TerminalCommandOptions,
  actions: TerminalCommandActions,
): Command[] {
  const { addPane, openExternal, activateProfile, broadcastCommand } = actions;
  const { currentGroupId, paneCount } = options;

  return useMemo(() => {
    const available = data.filter((e) => e.available);
    const claude = findProviderEntry(data, "claude");
    const cursor = findProviderEntry(data, "cursor");
    const cmds: Command[] = [];

    if (paneCount > 0) {
      cmds.push({
        id: "broadcast-command",
        title: t("cmd.terminal.broadcast"),
        group: t("cmd.group.agents"),
        icon: "📡",
        keywords: "broadcast send all panes command run",
        input: {
          placeholder: t("cmd.input.broadcastPlaceholder"),
          onSubmit: (value) => broadcastCommand(value),
        },
      });
    }

    if (claude?.available && cursor?.available) {
      cmds.push({
        id: "open-claude-cursor",
        title: t("cmd.terminal.openClaudeCursor"),
        group: t("cmd.group.agents"),
        icon: "⚡",
        keywords: "claude cursor agent",
        run: () => {
          void (async () => {
            await addPane("claude");
            await addPane(cursor.tool);
          })();
        },
      });
    }

    for (const entry of available) {
      cmds.push({
        id: `open-inapp-${entry.tool}`,
        title: t("cmd.terminal.openInApp", { tool: toolLabel(entry.tool) }),
        group: t("cmd.group.agents"),
        icon: "🖥️",
        keywords: `${entry.tool} in-app terminal`,
        run: () => void addPane(entry.tool),
      });
    }

    const mod = modLabel();
    const profiles =
      forest?.groups.flatMap((g) =>
        g.profiles.map((p, idx) => ({
          ...p,
          groupName: g.name,
          // Ctrl+1–9 only switch within the currently displayed group.
          shortcut: g.id === currentGroupId && idx < 9 ? `${mod}+${idx + 1}` : undefined,
        })),
      ) ?? [];

    for (const profile of profiles) {
      const active = profile.id === activeProfileId;
      cmds.push({
        id: `profile-${profile.id}`,
        title: active
          ? t("cmd.terminal.switchProfileActive", { name: profile.name })
          : t("cmd.terminal.switchProfile", { name: profile.name }),
        group: t("cmd.group.profiles"),
        icon: "👤",
        keywords: `${profile.name} ${profile.groupName} profile`,
        shortcut: profile.shortcut,
        run: () => void activateProfile(profile.id),
      });
    }

    for (const entry of available) {
      cmds.push({
        id: `open-external-${entry.tool}`,
        title: t("cmd.terminal.openExternal", { tool: toolLabel(entry.tool) }),
        group: t("cmd.group.external"),
        icon: "🪟",
        keywords: `${entry.tool} external terminal`,
        run: () => void openExternal(entry.tool),
      });
    }

    cmds.push({
      id: "open-external-shell",
      title: t("cmd.terminal.openExternalShell"),
      group: t("cmd.group.external"),
      icon: "💻",
      keywords: "shell external terminal plain",
      run: () => void openExternal("shell"),
    });

    return cmds;
  }, [
    t,
    data,
    forest,
    activeProfileId,
    currentGroupId,
    paneCount,
    addPane,
    openExternal,
    activateProfile,
    broadcastCommand,
  ]);
}
