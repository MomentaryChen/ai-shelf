import { useCallback, useEffect, useRef, useState } from "react";
import type { PaneInfo } from "../terminal/split-tree";
import type { ChatSettings } from "../chat-settings";
import {
  applyPaneAgentOutput,
  applyPaneAgentUserInput,
  createPaneAgentState,
  paneNeedsAttention,
  tickPaneAgentState,
  type PaneAgentState,
  type PaneAgentStatus,
} from "../../shared/pane-agent-state.js";
import { paneDisplayLabel } from "../utils/pane-label";
import type { MessageKey } from "../i18n/messages/en";

export type PaneAgentStateMap = Record<string, PaneAgentStatus>;

const NOTIFY_COOLDOWN_MS = 30_000;

function playAttentionSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    void ctx.close();
  } catch {
    /* Web Audio unavailable */
  }
}

function stateOptions(settings: ChatSettings) {
  return {
    runningGraceMs: 2_500,
    stallTimeoutMs: settings.paneAgentStallTimeoutSec * 1_000,
    tailMaxChars: 4_096,
  };
}

export function usePaneAgentAwareness(
  panes: PaneInfo[],
  focusedPaneId: string | null,
  settings: ChatSettings,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  windowFocused: boolean,
) {
  const [states, setStates] = useState<Record<string, PaneAgentState>>({});
  const prevStatusRef = useRef<Record<string, PaneAgentStatus>>({});
  const notifyCooldownRef = useRef<Record<string, number>>({});

  const paneBySession = useRef(new Map<string, PaneInfo>());
  useEffect(() => {
    const map = new Map<string, PaneInfo>();
    for (const p of panes) map.set(p.sessionId, p);
    paneBySession.current = map;
  }, [panes]);

  const notify = useCallback(
    async (
      pane: PaneInfo,
      titleKey: MessageKey,
      bodyKey: MessageKey,
      silent: boolean,
    ) => {
      if (!settings.paneAgentAwarenessEnabled) return;
      const title = t(titleKey, { pane: paneDisplayLabel(pane) });
      const body = t(bodyKey, { pane: paneDisplayLabel(pane) });
      const playSound = settings.paneAgentNotifySound && !silent;
      if (settings.paneAgentNotifySystem) {
        await window.api.showPaneAgentNotification({
          title,
          body,
          paneId: pane.id,
          silent: !playSound,
        });
      }
      if (playSound) playAttentionSound();
    },
    [settings, t],
  );

  const handleTransition = useCallback(
    (pane: PaneInfo, prev: PaneAgentStatus, next: PaneAgentStatus) => {
      if (!settings.paneAgentAwarenessEnabled) return;
      const shouldNotify =
        !settings.paneAgentNotifyUnfocusedOnly ||
        focusedPaneId !== pane.id ||
        !windowFocused;
      if (!shouldNotify) return;

      const cooldownKey = `${pane.id}:${next}`;
      const now = Date.now();
      const last = notifyCooldownRef.current[cooldownKey] ?? 0;
      if (now - last < NOTIFY_COOLDOWN_MS) return;

      let fired = false;
      if (next === "waiting_input" && prev === "running") {
        void notify(pane, "pane.agent.notify.waitingTitle", "pane.agent.notify.waitingBody", false);
        fired = true;
      } else if (next === "idle" && prev === "running") {
        void notify(pane, "pane.agent.notify.readyTitle", "pane.agent.notify.readyBody", false);
        fired = true;
      } else if (next === "stalled" && prev !== "stalled") {
        void notify(pane, "pane.agent.notify.stalledTitle", "pane.agent.notify.stalledBody", false);
        fired = true;
      }
      if (fired) notifyCooldownRef.current[cooldownKey] = now;
    },
    [focusedPaneId, notify, settings, windowFocused],
  );

  useEffect(() => {
    for (const pane of panes) {
      const status = states[pane.id]?.status;
      if (!status) continue;
      const prev = prevStatusRef.current[pane.id];
      if (prev !== undefined && prev !== status) {
        handleTransition(pane, prev, status);
      }
      prevStatusRef.current[pane.id] = status;
    }
    for (const id of Object.keys(prevStatusRef.current)) {
      if (!panes.some((p) => p.id === id)) delete prevStatusRef.current[id];
    }
  }, [handleTransition, panes, states]);

  const updateSession = useCallback(
    (sessionId: string, updater: (prev: PaneAgentState) => PaneAgentState) => {
      const pane = paneBySession.current.get(sessionId);
      if (!pane || !settings.paneAgentAwarenessEnabled) return;

      setStates((prev) => {
        const current = prev[pane.id] ?? createPaneAgentState();
        const nextState = updater(current);
        if (nextState === current) return prev;
        return { ...prev, [pane.id]: nextState };
      });
    },
    [settings.paneAgentAwarenessEnabled],
  );

  useEffect(() => {
    if (!settings.paneAgentAwarenessEnabled) {
      setStates({});
      prevStatusRef.current = {};
      void window.api.setTrayPaneAttention(0);
      return;
    }

    const off = window.api.onPtyData(({ sessionId, data }) => {
      const now = Date.now();
      updateSession(sessionId, (prev) =>
        applyPaneAgentOutput(prev, data, now, stateOptions(settings)),
      );
    });

    return off;
  }, [settings, updateSession]);

  useEffect(() => {
    const paneIds = new Set(panes.map((p) => p.id));
    setStates((prev) => {
      const next: Record<string, PaneAgentState> = {};
      let changed = false;
      for (const [id, state] of Object.entries(prev)) {
        if (paneIds.has(id)) next[id] = state;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [panes]);

  const recordUserInput = useCallback(
    (sessionId: string) => {
      if (!settings.paneAgentAwarenessEnabled) return;
      const now = Date.now();
      updateSession(sessionId, (prev) =>
        applyPaneAgentUserInput(prev, now, stateOptions(settings)),
      );
    },
    [settings, updateSession],
  );

  useEffect(() => {
    if (!settings.paneAgentAwarenessEnabled) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const opts = stateOptions(settings);
      setStates((prev) => {
        let next = prev;
        for (const pane of panes) {
          const current = prev[pane.id];
          if (!current) continue;
          const ticked = tickPaneAgentState(current, now, opts);
          if (ticked === current) continue;
          if (next === prev) next = { ...prev };
          next[pane.id] = ticked;
        }
        return next;
      });
    }, 4_000);
    return () => window.clearInterval(id);
  }, [panes, settings]);

  useEffect(() => {
    if (!settings.paneAgentAwarenessEnabled || !settings.paneAgentNotifyTrayBadge) {
      void window.api.setTrayPaneAttention(0);
      return;
    }
    let count = 0;
    for (const pane of panes) {
      const status = states[pane.id]?.status;
      if (status && paneNeedsAttention(status)) {
        if (settings.paneAgentNotifyUnfocusedOnly && focusedPaneId === pane.id && windowFocused) {
          continue;
        }
        count += 1;
      }
    }
    void window.api.setTrayPaneAttention(count);
  }, [focusedPaneId, panes, settings, states, windowFocused]);

  const statusMap: PaneAgentStateMap = {};
  if (settings.paneAgentAwarenessEnabled) {
    for (const pane of panes) {
      statusMap[pane.id] = states[pane.id]?.status ?? "idle";
    }
  }

  return { paneAgentStates: statusMap, recordPaneAgentInput: recordUserInput };
}
