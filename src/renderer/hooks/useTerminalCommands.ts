import { useMemo } from "react";
import type { Command } from "../components/CommandPalette";
import type { ProfileForest, ProviderEntry } from "../types";
import { findProviderEntry } from "../utils/claude-cursor-diff";
import { toolLabel } from "../utils";

export interface TerminalCommandActions {
  addPane: (tool: string) => void | Promise<void>;
  openExternal: (tool: string) => void | Promise<void>;
  activateProfile: (profileId: string) => void | Promise<void>;
}

export function useTerminalCommands(
  t: (key: import("../i18n/messages/en").MessageKey, params?: Record<string, string | number>) => string,
  data: ProviderEntry[],
  forest: ProfileForest | null,
  activeProfileId: string | null,
  actions: TerminalCommandActions,
): Command[] {
  const { addPane, openExternal, activateProfile } = actions;

  return useMemo(() => {
    const available = data.filter((e) => e.available);
    const claude = findProviderEntry(data, "claude");
    const cursor = findProviderEntry(data, "cursor");
    const cmds: Command[] = [];

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

    const profiles =
      forest?.groups.flatMap((g) =>
        g.profiles.map((p) => ({ ...p, groupName: g.name })),
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
  }, [t, data, forest, activeProfileId, addPane, openExternal, activateProfile]);
}
