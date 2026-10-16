import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaneInfo } from "../terminal/split-tree";
import type { ChatSettings } from "../chat-settings";
import {
  applyPaneAgentOutput,
  applyPaneAgentUserInput,
  createPaneAgentState,
  paneNeedsAttention,
  PANE_AGENT_MIN_RUNNING_FOR_READY_MS,
  PANE_AGENT_READY_IDLE_STABLE_MS,
  tickPaneAgentState,
  type PaneAgentState,
  type PaneAgentStatus,
} from "../../shared/pane-agent-state.js";
import {
  reduceBackgroundAttention,
  summarizeBackgroundAttention,
  type BackgroundAttentionEvent,
  type BackgroundAttentionKind,
  type BackgroundAttentionMap,
} from "../../shared/background-agent-attention.js";
import { paneDisplayLabel } from "../utils/pane-label";
import type { MessageKey } from "../i18n/messages/en";

export type PaneAgentStateMap = Record<string, PaneAgentStatus>;

/** A pane living in a non-active profile whose agent output is still tracked. */
export interface BackgroundAgentPane {
  pane: PaneInfo;
  profileId: string;
  profileName: string;
}

/** Emitted when a background agent needs attention (for in-app toasts). */
export interface BackgroundAgentNotice {
  paneId: string;
  profileId: string;
  kind: BackgroundAttentionKind;
  title: string;
  body: string;
}

export interface BackgroundAgentOptions {
  panes: BackgroundAgentPane[];
  onNotice?: (notice: BackgroundAgentNotice) => void;
}

const NO_BACKGROUND: BackgroundAgentOptions = { panes: [] };

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
    // Close only after the tone finishes; closing right away silences it.
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* Web Audio unavailable */
  }
}

function stateOptions(settings: ChatSettings) {
  return {
    runningGraceMs: 2_500,
    runningIndicatorMaxAgeMs: 12_000,
    stallTimeoutMs: settings.paneAgentStallTimeoutSec * 1_000,
    tailMaxChars: 4_096,
  };
}

function statusVisibleEqual(a: PaneAgentState, b: PaneAgentState): boolean {
  return (
    a.status === b.status &&
    a.wasRunning === b.wasRunning &&
    a.runningSinceAt === b.runningSinceAt &&
    a.lastRunningSpellMs === b.lastRunningSpellMs
  );
}

export function usePaneAgentAwareness(
  panes: PaneInfo[],
  focusedPaneId: string | null,
  settings: ChatSettings,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  windowFocused: boolean,
  background: BackgroundAgentOptions = NO_BACKGROUND,
) {
  const [states, setStates] = useState<Record<string, PaneAgentState>>({});
  const statesRef = useRef(states);
  statesRef.current = states;

  /** Authoritative per-pane state including tail; React state only commits status-visible fields. */
  const draftRef = useRef<Record<string, PaneAgentState>>({});
  const pendingOutputRef = useRef(new Map<string, string>());
  const coalesceRafRef = useRef(0);
  const coalesceTimerRef = useRef(0);

  const prevStatusRef = useRef<Record<string, PaneAgentStatus>>({});
  const notifyCooldownRef = useRef<Record<string, number>>({});
  const readyNotifiedRef = useRef<Record<string, boolean>>({});
  const readyPendingRef = useRef<Record<string, number>>({});

  const backgroundPanes = background.panes;
  const onNoticeRef = useRef(background.onNotice);
  onNoticeRef.current = background.onNotice;
  const windowFocusedRef = useRef(windowFocused);
  windowFocusedRef.current = windowFocused;
  const backgroundByPane = useMemo(() => {
    const map = new Map<string, BackgroundAgentPane>();
    for (const b of backgroundPanes) map.set(b.pane.id, b);
    return map;
  }, [backgroundPanes]);
  const backgroundByPaneRef = useRef(backgroundByPane);
  backgroundByPaneRef.current = backgroundByPane;

  /** Active layout panes + live panes of background profiles. */
  const trackedPanes = useMemo(() => {
    if (backgroundPanes.length === 0) return panes;
    const seen = new Set(panes.map((p) => p.id));
    const out = [...panes];
    for (const b of backgroundPanes) {
      if (seen.has(b.pane.id)) continue;
      seen.add(b.pane.id);
      out.push(b.pane);
    }
    return out;
  }, [panes, backgroundPanes]);

  const [attention, setAttention] = useState<BackgroundAttentionMap>({});
  const dispatchAttention = useCallback((event: BackgroundAttentionEvent) => {
    setAttention((prev) => reduceBackgroundAttention(prev, event));
  }, []);

  useEffect(() => {
    const paneIds = new Set(backgroundByPane.keys());
    dispatchAttention({ type: "retain", paneIds });
  }, [backgroundByPane, dispatchAttention]);

  const paneBySession = useRef(new Map<string, PaneInfo>());
  useEffect(() => {
    const map = new Map<string, PaneInfo>();
    for (const p of trackedPanes) map.set(p.sessionId, p);
    paneBySession.current = map;
  }, [trackedPanes]);

  const clearReadyPending = useCallback((paneId: string) => {
    const timer = readyPendingRef.current[paneId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete readyPendingRef.current[paneId];
    }
  }, []);

  const cancelOutputCoalesce = useCallback(() => {
    if (coalesceRafRef.current) {
      cancelAnimationFrame(coalesceRafRef.current);
      coalesceRafRef.current = 0;
    }
    if (coalesceTimerRef.current) {
      window.clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = 0;
    }
  }, []);

  const shouldNotifyPane = useCallback(
    (pane: PaneInfo) => {
      if (!settings.paneAgentAwarenessEnabled) return false;
      // Background profile panes are never on screen.
      if (backgroundByPaneRef.current.has(pane.id)) return true;
      return (
        !settings.paneAgentNotifyUnfocusedOnly ||
        focusedPaneId !== pane.id ||
        !windowFocused
      );
    },
    [focusedPaneId, settings, windowFocused],
  );

  const notify = useCallback(
    async (
      pane: PaneInfo,
      titleKey: MessageKey,
      bodyKey: MessageKey,
      silent: boolean,
      kind?: BackgroundAttentionKind,
      params?: Record<string, string | number>,
    ) => {
      if (!settings.paneAgentAwarenessEnabled) return;
      const bg = backgroundByPaneRef.current.get(pane.id);
      const label = bg
        ? t("pane.agent.bg.paneLabel", { profile: bg.profileName, pane: paneDisplayLabel(pane) })
        : paneDisplayLabel(pane);
      const title = t(titleKey, { ...params, pane: label });
      const body = t(bodyKey, { ...params, pane: label });
      const playSound = settings.paneAgentNotifySound && !silent;
      // Background profile + app in front: an in-app toast replaces the OS notification.
      const onNotice = onNoticeRef.current;
      if (bg && kind && onNotice && windowFocusedRef.current) {
        if (settings.paneAgentNotifySystem) {
          onNotice({ paneId: pane.id, profileId: bg.profileId, kind, title, body });
        }
        if (playSound) playAttentionSound();
        return;
      }
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

  const scheduleReadyNotify = useCallback(
    (pane: PaneInfo, runningDurationMs: number) => {
      clearReadyPending(pane.id);
      if (readyNotifiedRef.current[pane.id]) return;
      if (runningDurationMs < PANE_AGENT_MIN_RUNNING_FOR_READY_MS) return;
      if (!shouldNotifyPane(pane)) return;

      readyPendingRef.current[pane.id] = window.setTimeout(() => {
        delete readyPendingRef.current[pane.id];
        const state = draftRef.current[pane.id] ?? statesRef.current[pane.id];
        if (!state || state.status !== "idle") return;
        if (readyNotifiedRef.current[pane.id]) return;
        if (!shouldNotifyPane(pane)) return;

        readyNotifiedRef.current[pane.id] = true;
        const bg = backgroundByPaneRef.current.get(pane.id);
        if (bg) {
          dispatchAttention({
            type: "finished",
            paneId: pane.id,
            profileId: bg.profileId,
            at: Date.now(),
          });
        }
        void notify(
          pane,
          "pane.agent.notify.readyTitle",
          "pane.agent.notify.readyBody",
          false,
          "finished",
        );
      }, PANE_AGENT_READY_IDLE_STABLE_MS);
    },
    [clearReadyPending, dispatchAttention, notify, shouldNotifyPane],
  );

  const handleTransition = useCallback(
    (
      pane: PaneInfo,
      prev: PaneAgentStatus,
      next: PaneAgentStatus,
      paneState: PaneAgentState | undefined,
    ) => {
      if (!settings.paneAgentAwarenessEnabled) return;

      if (next === "running" || next === "waiting_input") {
        clearReadyPending(pane.id);
      }

      const bg = backgroundByPaneRef.current.get(pane.id);
      if (bg) {
        dispatchAttention({
          type: "status",
          paneId: pane.id,
          profileId: bg.profileId,
          next,
          at: Date.now(),
        });
      }

      if (!shouldNotifyPane(pane)) return;

      const cooldownKey = `${pane.id}:${next}`;
      const now = Date.now();
      const last = notifyCooldownRef.current[cooldownKey] ?? 0;
      if (now - last < NOTIFY_COOLDOWN_MS) return;

      let fired = false;
      if (next === "waiting_input" && prev === "running") {
        void notify(
          pane,
          "pane.agent.notify.waitingTitle",
          "pane.agent.notify.waitingBody",
          false,
          "waiting_input",
        );
        fired = true;
      } else if (next === "idle" && prev === "running") {
        scheduleReadyNotify(pane, paneState?.lastRunningSpellMs ?? 0);
      } else if (next === "stalled" && prev !== "stalled") {
        void notify(
          pane,
          "pane.agent.notify.stalledTitle",
          "pane.agent.notify.stalledBody",
          false,
          "error",
        );
        fired = true;
      }
      if (fired) notifyCooldownRef.current[cooldownKey] = now;
    },
    [
      clearReadyPending,
      dispatchAttention,
      notify,
      scheduleReadyNotify,
      settings,
      shouldNotifyPane,
    ],
  );

  useEffect(() => {
    for (const pane of trackedPanes) {
      const paneState = states[pane.id];
      const status = paneState?.status;
      if (!status) continue;
      const prev = prevStatusRef.current[pane.id];
      if (prev !== undefined && prev !== status) {
        handleTransition(pane, prev, status, paneState);
      }
      prevStatusRef.current[pane.id] = status;
    }
    for (const id of Object.keys(prevStatusRef.current)) {
      if (!trackedPanes.some((p) => p.id === id)) {
        delete prevStatusRef.current[id];
        delete readyNotifiedRef.current[id];
        clearReadyPending(id);
      }
    }
  }, [clearReadyPending, handleTransition, trackedPanes, states]);

  useEffect(() => {
    return () => {
      for (const id of Object.keys(readyPendingRef.current)) {
        window.clearTimeout(readyPendingRef.current[id]);
      }
      readyPendingRef.current = {};
    };
  }, []);

  const commitPaneState = useCallback((paneId: string, nextState: PaneAgentState) => {
    draftRef.current[paneId] = nextState;
    setStates((prev) => {
      const current = prev[paneId] ?? createPaneAgentState();
      if (statusVisibleEqual(current, nextState)) return prev;
      return { ...prev, [paneId]: nextState };
    });
  }, []);

  const updateSession = useCallback(
    (sessionId: string, updater: (prev: PaneAgentState) => PaneAgentState) => {
      const pane = paneBySession.current.get(sessionId);
      if (!pane || !settings.paneAgentAwarenessEnabled) return;

      const current =
        draftRef.current[pane.id] ?? statesRef.current[pane.id] ?? createPaneAgentState();
      const nextState = updater(current);
      if (nextState === current) return;
      commitPaneState(pane.id, nextState);
    },
    [commitPaneState, settings.paneAgentAwarenessEnabled],
  );

  const flushPendingOutput = useCallback(() => {
    coalesceRafRef.current = 0;
    if (coalesceTimerRef.current) {
      window.clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = 0;
    }
    const pending = pendingOutputRef.current;
    if (pending.size === 0) return;
    pendingOutputRef.current = new Map();
    const now = Date.now();
    const opts = stateOptions(settings);
    for (const [sessionId, data] of pending) {
      if (!data) continue;
      const pane = paneBySession.current.get(sessionId);
      if (!pane || !settings.paneAgentAwarenessEnabled) continue;
      const current =
        draftRef.current[pane.id] ?? statesRef.current[pane.id] ?? createPaneAgentState();
      commitPaneState(pane.id, applyPaneAgentOutput(current, data, now, opts));
    }
  }, [commitPaneState, settings]);

  const scheduleOutputFlush = useCallback(() => {
    if (coalesceRafRef.current) return;
    coalesceRafRef.current = requestAnimationFrame(() => {
      flushPendingOutput();
    });
    // Cap wait when rAF is throttled (background / occluded windows).
    if (!coalesceTimerRef.current) {
      coalesceTimerRef.current = window.setTimeout(() => {
        coalesceTimerRef.current = 0;
        if (coalesceRafRef.current) {
          cancelAnimationFrame(coalesceRafRef.current);
          coalesceRafRef.current = 0;
        }
        flushPendingOutput();
      }, 50);
    }
  }, [flushPendingOutput]);

  useEffect(() => {
    if (!settings.paneAgentAwarenessEnabled) {
      cancelOutputCoalesce();
      pendingOutputRef.current.clear();
      draftRef.current = {};
      setStates({});
      setAttention({});
      prevStatusRef.current = {};
      readyNotifiedRef.current = {};
      for (const id of Object.keys(readyPendingRef.current)) {
        window.clearTimeout(readyPendingRef.current[id]);
      }
      readyPendingRef.current = {};
      void window.api.setTrayPaneAttention(0);
      return;
    }

    const offData = window.api.onPtyData(({ sessionId, data }) => {
      const prev = pendingOutputRef.current.get(sessionId) ?? "";
      pendingOutputRef.current.set(sessionId, prev + data);
      scheduleOutputFlush();
    });

    const offExit = window.api.onPtyExit(({ sessionId, exitCode }) => {
      const pane = paneBySession.current.get(sessionId);
      // Apply coalesced bytes before reset so the final chunk is not dropped.
      const pending = pendingOutputRef.current.get(sessionId);
      if (pending) {
        pendingOutputRef.current.delete(sessionId);
        if (pane && settings.paneAgentAwarenessEnabled) {
          const current =
            draftRef.current[pane.id] ?? statesRef.current[pane.id] ?? createPaneAgentState();
          commitPaneState(
            pane.id,
            applyPaneAgentOutput(current, pending, Date.now(), stateOptions(settings)),
          );
        }
      }
      if (pane) {
        readyNotifiedRef.current[pane.id] = false;
        clearReadyPending(pane.id);
        const bg = backgroundByPaneRef.current.get(pane.id);
        if (bg && exitCode !== 0) {
          dispatchAttention({
            type: "exited",
            paneId: pane.id,
            profileId: bg.profileId,
            exitCode,
            at: Date.now(),
          });
          void notify(
            pane,
            "pane.agent.notify.exitedTitle",
            "pane.agent.notify.exitedBody",
            false,
            "error",
            { code: exitCode },
          );
        }
      }
      // Process is gone -- do not treat as busy for close-confirm / status dots.
      updateSession(sessionId, () => createPaneAgentState());
    });

    return () => {
      offData();
      offExit();
      cancelOutputCoalesce();
    };
  }, [
    cancelOutputCoalesce,
    clearReadyPending,
    commitPaneState,
    dispatchAttention,
    notify,
    scheduleOutputFlush,
    settings,
    updateSession,
  ]);

  useEffect(() => {
    const paneIds = new Set(trackedPanes.map((p) => p.id));
    for (const id of Object.keys(draftRef.current)) {
      if (!paneIds.has(id)) delete draftRef.current[id];
    }
    setStates((prev) => {
      const next: Record<string, PaneAgentState> = {};
      let changed = false;
      for (const [id, state] of Object.entries(prev)) {
        if (paneIds.has(id)) next[id] = state;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [trackedPanes]);

  const recordUserInput = useCallback(
    (sessionId: string) => {
      if (!settings.paneAgentAwarenessEnabled) return;
      const pane = paneBySession.current.get(sessionId);
      if (pane) {
        readyNotifiedRef.current[pane.id] = false;
        clearReadyPending(pane.id);
      }
      const now = Date.now();
      updateSession(sessionId, (prev) =>
        applyPaneAgentUserInput(prev, now, stateOptions(settings)),
      );
    },
    [clearReadyPending, settings, updateSession],
  );

  useEffect(() => {
    if (!settings.paneAgentAwarenessEnabled) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const opts = stateOptions(settings);
      for (const pane of trackedPanes) {
        const current = draftRef.current[pane.id] ?? statesRef.current[pane.id];
        if (!current) continue;
        const ticked = tickPaneAgentState(current, now, opts);
        if (statusVisibleEqual(current, ticked) && ticked.tail === current.tail) {
          draftRef.current[pane.id] = ticked;
          continue;
        }
        commitPaneState(pane.id, ticked);
      }
    }, 4_000);
    return () => window.clearInterval(id);
  }, [commitPaneState, trackedPanes, settings]);

  useEffect(() => {
    if (!settings.paneAgentAwarenessEnabled || !settings.paneAgentNotifyTrayBadge) {
      void window.api.setTrayPaneAttention(0);
      return;
    }
    let count = 0;
    for (const pane of trackedPanes) {
      const status = states[pane.id]?.status;
      if (status && paneNeedsAttention(status)) {
        if (settings.paneAgentNotifyUnfocusedOnly && focusedPaneId === pane.id && windowFocused) {
          continue;
        }
        count += 1;
      }
    }
    void window.api.setTrayPaneAttention(count);
  }, [focusedPaneId, trackedPanes, settings, states, windowFocused]);

  const statusMap: PaneAgentStateMap = {};
  if (settings.paneAgentAwarenessEnabled) {
    for (const pane of trackedPanes) {
      statusMap[pane.id] = states[pane.id]?.status ?? "idle";
    }
  }

  const backgroundAttention = useMemo(() => summarizeBackgroundAttention(attention), [attention]);

  return {
    paneAgentStates: statusMap,
    recordPaneAgentInput: recordUserInput,
    /** Per-profile badge summary for background profiles needing attention. */
    backgroundAttention,
    /** Per-pane background attention (keyed by pane id). */
    backgroundPaneAttention: attention,
  };
}
