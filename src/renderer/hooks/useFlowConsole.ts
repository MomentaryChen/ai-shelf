import { useEffect, useState } from "react";
import type { FlowConsoleChunk } from "../../shared/flow-console-types.js";

type FlowConsoleView = {
  text: string;
  truncated: boolean;
  phaseId: string | null;
  alive: boolean;
  lastSeq: number;
};

const EMPTY: FlowConsoleView = {
  text: "",
  truncated: false,
  phaseId: null,
  alive: false,
  lastSeq: 0,
};

function applyChunk(prev: FlowConsoleView, chunk: FlowConsoleChunk): FlowConsoleView {
  if (chunk.seq <= prev.lastSeq) return prev;
  return {
    text: prev.text + chunk.data,
    truncated: prev.truncated || chunk.truncated,
    phaseId: chunk.phaseId ?? prev.phaseId,
    alive: true,
    lastSeq: chunk.seq,
  };
}

/**
 * Attach to a flow run's live console: subscribe first, then seed from the
 * ring buffer (same order as EmbeddedTerminal + ptyAttach).
 */
export function useFlowConsole(runId: string | null | undefined): FlowConsoleView {
  const [view, setView] = useState<FlowConsoleView>(EMPTY);

  useEffect(() => {
    if (!runId) {
      setView(EMPTY);
      return;
    }

    setView(EMPTY);
    let cancelled = false;
    let seeded = false;
    let lastSeq = 0;
    const pending: FlowConsoleChunk[] = [];

    const unsub = window.api.onFlowConsoleChunk((chunk: FlowConsoleChunk) => {
      if (cancelled || chunk.runId !== runId) return;
      if (!seeded) {
        pending.push(chunk);
        return;
      }
      if (chunk.seq <= lastSeq) return;
      lastSeq = chunk.seq;
      setView((prev) => applyChunk(prev, chunk));
    });

    void window.api.flowGetConsoleBuffer(runId).then((snap) => {
      if (cancelled || !snap) return;
      lastSeq = snap.lastSeq;
      let next: FlowConsoleView = {
        text: snap.text,
        truncated: snap.truncated,
        phaseId: snap.phaseId,
        alive: snap.alive,
        lastSeq: snap.lastSeq,
      };
      for (const chunk of pending) {
        next = applyChunk(next, chunk);
      }
      lastSeq = next.lastSeq;
      seeded = true;
      setView(next);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [runId]);

  return view;
}
