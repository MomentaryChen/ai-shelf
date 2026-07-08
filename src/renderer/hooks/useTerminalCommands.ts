import { createElement, useMemo } from "react";
import { AppWindow, Monitor, Radio, Terminal, User, Zap, type LucideIcon } from "lucide-react";
import type { Command } from "../components/CommandPalette";
import type { ProfileForest, ProviderEntry, SavedCommandSnippet } from "../types";
import { findProviderEntry } from "../utils/claude-cursor-diff";
import { modLabel } from "../profile-quick-switch";
import { toolLabel } from "../utils";

export interface TerminalCommandActions {
  addPane: (tool: string) => void | Promise<void>;
  openExternal: (tool: string) => void | Promise<void>;
  activateProfile: (profileId: string) => void | Promise<void>;
  /** Send a command line to every open pane (always all, regardless of broadcast toggle). */
  broadcastCommand: (text: string) => void;
  /** Run a saved snippet on a profile (focused pane or broadcast when flagged). */
  runSavedCommand: (profileId: string, command: string, broadcast: boolean) => void | Promise<void>;
}

export interface TerminalCommandOptions {
  /** Group whose profiles map to the Ctrl+1–9 quick-switch shortcuts. */
  currentGroupId: string | null;
  /** Number of open panes; the broadcast command is hidden when there are none. */
  paneCount: number;
  /** Saved snippets for the active profile (palette quick-run). */
  savedCommands: SavedCommandSnippet[];
}

/** Plain .ts file — build lucide icon elements without JSX. */
const icon = (Icon: LucideIcon) => createElement(Icon, { className: "h-4 w-4" });

export function useTerminalCommands(
  t: (key: import("../i18n/messages/en").MessageKey, params?: Record<string, string | number>) => string,
  data: ProviderEntry[],
  forest: ProfileForest | null,
  activeProfileId: string | null,
  options: TerminalCommandOptions,
  actions: TerminalCommandActions,
): Command[] {
  const { addPane, openExternal, activateProfile, broadcastCommand, runSavedCommand } = actions;
  const { currentGroupId, paneCount, savedCommands } = options;

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
        icon: icon(Radio),
        keywords: "broadcast send all panes command run",
        input: {
          placeholder: t("cmd.input.broadcastPlaceholder"),
          onSubmit: (value) => broadcastCommand(value),
        },
      });
    }

    if (paneCount > 0 && savedCommands.length > 0) {
      for (const snippet of savedCommands) {
        cmds.push({
          id: `saved-cmd-${snippet.id}`,
          title: snippet.broadcast
            ? t("cmd.terminal.runSavedBroadcast", { name: snippet.name })
            : t("cmd.terminal.runSaved", { name: snippet.name }),
          group: t("cmd.group.savedCommands"),
          icon: snippet.broadcast ? "📡" : "⚡",
          keywords: `${snippet.name} ${snippet.command} saved snippet command`,
          run: () => {
            if (!activeProfileId) return;
            void runSavedCommand(activeProfileId, snippet.command, snippet.broadcast ?? false);
          },
        });
      }
    }

    if (claude?.available && cursor?.available) {
      cmds.push({
        id: "open-claude-cursor",
        title: t("cmd.terminal.openClaudeCursor"),
        group: t("cmd.group.agents"),
        icon: icon(Zap),
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
        icon: icon(Monitor),
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
        icon: icon(User),
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
        icon: icon(AppWindow),
        keywords: `${entry.tool} external terminal`,
        run: () => void openExternal(entry.tool),
      });
    }

    cmds.push({
      id: "open-external-shell",
      title: t("cmd.terminal.openExternalShell"),
      group: t("cmd.group.external"),
      icon: icon(Terminal),
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
    savedCommands,
    addPane,
    openExternal,
    activateProfile,
    broadcastCommand,
    runSavedCommand,
  ]);
}
