import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { bindTerminalClipboard } from "../terminal/xterm-clipboard";
import {
  attachTerminalSearch,
  buildSearchSnapshot,
  clearTerminalSearch,
  jumpToSessionMatch,
  type ResolvedSessionMatch,
  SEARCH_DEBOUNCE_MS,
} from "../terminal/terminal-search";
import { bindTerminalLinks } from "../terminal/xterm-links";
import { registerTerminalClear } from "../terminal/terminal-session-actions";
import { TerminalFindBar } from "./TerminalFindBar";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  sessionId: string;
  bg?: string;
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  rightClickPaste?: boolean;
  active?: boolean;
  focused?: boolean;
  onExit: () => void;
  onSessionLost?: (sessionId: string) => void;
  onWrite?: (data: string, sessionId: string) => void;
  onRestart?: () => void;
}

/** True when the viewport is pinned to the latest output (ydisp === ybase). */
function isTerminalAtBottom(term: Terminal): boolean {
  const buffer = term.buffer.active;
  return buffer.viewportY === buffer.baseY;
}

function wheelLines(term: Terminal, ev: WheelEvent): number {
  const sensitivity = term.options.scrollSensitivity ?? 1;
  let lines = 0;
  if (ev.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    lines = ev.deltaY;
  } else if (ev.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    lines = ev.deltaY * term.rows;
  } else {
    lines = ev.deltaY / 50;
  }
  const scaled = Math.round(lines * sensitivity);
  if (scaled === 0) return ev.deltaY > 0 ? 1 : ev.deltaY < 0 ? -1 : 0;
  return scaled;
}

export function EmbeddedTerminal({
  sessionId,
  bg,
  fontFamily,
  fontSize,
  scrollback,
  rightClickPaste = true,
  active = true,
  focused = true,
  onExit,
  onSessionLost,
  onWrite,
  onRestart,
}: Props) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const activeRef = useRef(active);
  const onWriteRef = useRef(onWrite);
  const onSessionLostRef = useRef(onSessionLost);
  const fitRef = useRef<(() => void) | null>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const [hasNewOutput, setHasNewOutput] = useState(false);
  const stableOnExit = useCallback(onExit, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCapped, setMatchCapped] = useState(false);
  const [findInputFocusKey, setFindInputFocusKey] = useState(0);

  const findOpenRef = useRef(false);
  const findQueryRef = useRef(findQuery);
  const caseSensitiveRef = useRef(caseSensitive);
  const matchIndexRef = useRef(0);
  const matchCountRef = useRef(0);
  const sessionMatchesRef = useRef<ResolvedSessionMatch[]>([]);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  findQueryRef.current = findQuery;
  caseSensitiveRef.current = caseSensitive;
  matchIndexRef.current = matchIndex;
  matchCountRef.current = matchCount;

  const refocusFindInput = useCallback(() => {
    setFindInputFocusKey((k) => k + 1);
  }, []);

  const clearMatchStats = useCallback(() => {
    setMatchCount(0);
    setMatchIndex(0);
    setMatchCapped(false);
    matchIndexRef.current = 0;
    matchCountRef.current = 0;
    sessionMatchesRef.current = [];
  }, []);

  const closeFind = useCallback(() => {
    findOpenRef.current = false;
    setFindOpen(false);
    clearTerminalSearch(searchRef.current);
    clearMatchStats();
    termRef.current?.focus();
  }, [clearMatchStats]);

  const goToMatchIndex = useCallback((idx: number): boolean => {
    const term = termRef.current;
    const session = sessionMatchesRef.current;
    if (!term || session.length === 0 || idx < 1 || idx > session.length) {
      return false;
    }

    const ok =
      jumpToSessionMatch(
        term,
        session[idx - 1]!,
        findQueryRef.current,
        caseSensitiveRef.current,
        searchRef.current,
        idx,
      ) === "ok";

    setMatchIndex(idx);
    matchIndexRef.current = idx;
    if (!findOpenRef.current) {
      term.focus();
    } else {
      refocusFindInput();
    }
    return ok;
  }, [refocusFindInput]);

  const refreshMatchCount = useCallback(async (): Promise<number> => {
    const q = findQueryRef.current;
    const term = termRef.current;
    if (!q) {
      clearMatchStats();
      return 0;
    }

    try {
      const snapshot = await buildSearchSnapshot(
        sessionIdRef.current,
        term,
        q,
        caseSensitiveRef.current,
        searchRef.current,
      );
      sessionMatchesRef.current = snapshot.session;
      const total = snapshot.session.length;
      setMatchCount(total);
      setMatchCapped(snapshot.sessionCapped);
      matchCountRef.current = total;
      if (total === 0) {
        setMatchIndex(0);
        matchIndexRef.current = 0;
      } else if (matchIndexRef.current > total) {
        setMatchIndex(total);
        matchIndexRef.current = total;
      }
      return total;
    } catch (err) {
      console.error("[terminal-search] refresh failed", err);
      clearMatchStats();
      return 0;
    }
  }, [clearMatchStats]);

  const runSearch = useCallback(
    async (direction: "next" | "prev") => {
      if (sessionMatchesRef.current.length === 0 && findQueryRef.current) {
        await refreshMatchCount();
      }
      const total = sessionMatchesRef.current.length;
      if (total === 0) {
        setMatchIndex(0);
        matchIndexRef.current = 0;
        return;
      }

      let idx = matchIndexRef.current || 1;
      if (direction === "next") {
        idx = idx >= total ? 1 : idx + 1;
      } else {
        idx = idx <= 1 ? total : idx - 1;
      }

      goToMatchIndex(idx);
      refocusFindInput();
    },
    [goToMatchIndex, refreshMatchCount, refocusFindInput],
  );

  const refreshMatchCountRef = useRef(refreshMatchCount);
  refreshMatchCountRef.current = refreshMatchCount;

  const goToMatchIndexRef = useRef(goToMatchIndex);
  goToMatchIndexRef.current = goToMatchIndex;

  const runFindQuery = useCallback(async () => {
    if (!findOpenRef.current) return;
    const total = await refreshMatchCountRef.current();
    if (total > 0) {
      goToMatchIndexRef.current(1);
    } else {
      setMatchIndex(0);
      matchIndexRef.current = 0;
    }
    refocusFindInput();
  }, [refocusFindInput]);

  const openFind = useCallback(() => {
    findOpenRef.current = true;
    setFindOpen(true);
    refocusFindInput();
    if (findQueryRef.current) {
      void runFindQuery();
    }
  }, [runFindQuery, refocusFindInput]);

  const openFindRef = useRef(openFind);
  openFindRef.current = openFind;

  const rightClickPasteRef = useRef(rightClickPaste);
  rightClickPasteRef.current = rightClickPaste;

  activeRef.current = active;
  onWriteRef.current = onWrite;
  onSessionLostRef.current = onSessionLost;

  useEffect(() => {
    setHasNewOutput(false);
  }, [sessionId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const background =
      bg ||
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim() ||
      "#0f172a";

    const term = new Terminal({
      theme: {
        background,
        foreground: "#cccccc",
        cursor: "#ffffff",
        cursorAccent: background,
        selectionBackground: "#ffffff40",
        black: "#0c0c0c",
        brightBlack: "#767676",
        red: "#c50f1f",
        brightRed: "#e74856",
        green: "#13a10e",
        brightGreen: "#16c60c",
        yellow: "#c19c00",
        brightYellow: "#f9f1a5",
        blue: "#0037da",
        brightBlue: "#3b78ff",
        magenta: "#881798",
        brightMagenta: "#b4009e",
        cyan: "#3a96dd",
        brightCyan: "#61d6d6",
        white: "#cccccc",
        brightWhite: "#f2f2f2",
      },
      fontFamily,
      fontSize,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback,
      scrollOnUserInput: false,
      smoothScrollDuration: 0,
      allowProposedApi: false,
      rightClickSelectsWord: !rightClickPasteRef.current,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    termRef.current = term;
    const searchAddon = attachTerminalSearch(term);
    searchRef.current = searchAddon;

    const doClear = () => {
      term.clear();
      window.api.ptyWrite(sessionId, "\x0c");
    };
    const unregisterClear = registerTerminalClear(sessionId, doClear);
    const unbindClipboard = bindTerminalClipboard(term, el, {
      onOpenFind: () => openFindRef.current(),
      onClear: doClear,
      onRestart: onRestart,
      getRightClickPaste: () => rightClickPasteRef.current,
    });
    const unbindLinks = bindTerminalLinks(term);

    const pending: string[] = [];
    let opened = true;
    let rafId = 0;
    let wakeTimer = 0;
    let statusTimer = 0;
    let receivedBytes = 0;

    const syncNewOutputHint = () => {
      if (isTerminalAtBottom(term)) setHasNewOutput(false);
    };

    const writeSafe = (data: string) => {
      if (!opened) {
        pending.push(data);
        return;
      }
      const wasAtBottom = isTerminalAtBottom(term);
      try {
        term.write(data);
      } catch (err) {
        console.error("[xterm-write]", sessionId, err);
        return;
      }
      if (!wasAtBottom) setHasNewOutput(true);
    };

    const flushPending = () => {
      if (!opened || pending.length === 0) return;
      const chunk = pending.splice(0, pending.length).join("");
      const wasAtBottom = isTerminalAtBottom(term);
      try {
        term.write(chunk);
      } catch (err) {
        console.error("[xterm-flush]", sessionId, err);
        return;
      }
      if (!wasAtBottom) setHasNewOutput(true);
    };

    const scrollToBottom = () => {
      term.scrollToBottom();
      setHasNewOutput(false);
      term.focus();
    };
    scrollToBottomRef.current = scrollToBottom;

    const syncPtySize = () => {
      const cols = Math.max(term.cols, 2);
      const rows = Math.max(term.rows, 2);
      window.api.ptyResize(sessionId, cols, rows);
    };

    const fit = () => {
      const target = containerRef.current;
      if (!target || target.clientWidth === 0 || target.clientHeight === 0) return;
      try {
        fitAddon.fit();
      } catch {
        /* mid-layout */
      }
      syncPtySize();
    };

    fitRef.current = fit;

    const scheduleFit = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    };

    scheduleFit();
    flushPending();

    const offScroll = term.onScroll(syncNewOutputHint);

    /** Ensure mouse wheel scrolls history in Electron (xterm viewport may not receive the event). */
    const onWheel = (ev: WheelEvent) => {
      if (ev.ctrlKey || ev.metaKey) return;
      const buffer = term.buffer.active;
      if (buffer.baseY <= 0) return;

      const before = buffer.viewportY;
      const lines = wheelLines(term, ev);
      if (lines === 0) return;

      term.scrollLines(lines);
      syncNewOutputHint();

      if (term.buffer.active.viewportY !== before) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });

    const offData = window.api.onPtyData(({ sessionId: sid, data }) => {
      if (sid !== sessionId) return;
      receivedBytes += data.length;
      writeSafe(data);
    });

    const offExit = window.api.onPtyExit(({ sessionId: sid }) => {
      if (sid !== sessionId) return;
      const wasAtBottom = isTerminalAtBottom(term);
      term.writeln("\r\n\x1b[90m[process exited — press any key to close]\x1b[0m");
      if (!wasAtBottom) setHasNewOutput(true);
      const d = term.onKey(() => {
        d.dispose();
        stableOnExit();
      });
    });

    term.onData((data) => {
      const write = onWriteRef.current;
      if (write) write(data, sessionId);
      else window.api.ptyWrite(sessionId, data);
    });

    let cancelled = false;
    void window.api.ptyAttach(sessionId).then((r) => {
      if (cancelled) return;
      if (!r.alive) {
        onSessionLostRef.current?.(sessionId);
        return;
      }
      if (r.buffer) {
        receivedBytes += r.buffer.length;
        writeSafe(r.buffer);
      }
      flushPending();
      scheduleFit();

      wakeTimer = window.setTimeout(() => {
        if (cancelled || receivedBytes > 0) return;
        window.api.ptyWrite(sessionId, "\r");
        scheduleFit();
      }, 400);

      statusTimer = window.setTimeout(() => {
        if (cancelled || receivedBytes > 0) return;
        const wasAtBottom = isTerminalAtBottom(term);
        term.writeln("\r\n\x1b[33m[terminal] waiting for shell output — click here and press Enter\x1b[0m");
        if (!wasAtBottom) setHasNewOutput(true);
      }, 2500);
    });

    const ro = new ResizeObserver(scheduleFit);
    ro.observe(el);

    const onPointerDown = () => {
      if (!findOpenRef.current) term.focus();
    };
    el.addEventListener("pointerdown", onPointerDown);

    return () => {
      cancelled = true;
      opened = false;
      window.clearTimeout(wakeTimer);
      window.clearTimeout(statusTimer);
      cancelAnimationFrame(rafId);
      fitRef.current = null;
      scrollToBottomRef.current = null;
      termRef.current = null;
      searchRef.current = null;
      offScroll.dispose();
      offData();
      offExit();
      el.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("pointerdown", onPointerDown);
      unregisterClear();
      unbindClipboard();
      unbindLinks();
      ro.disconnect();
      searchAddon.dispose();
      term.dispose();
    };
  }, [sessionId, stableOnExit, bg, fontFamily, fontSize, scrollback, onRestart]);

  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.rightClickSelectsWord = !rightClickPaste;
  }, [rightClickPaste]);

  useEffect(() => {
    if (!findOpen) return;
    if (!findQuery) {
      clearTerminalSearch(searchRef.current);
      clearMatchStats();
      return;
    }
    const timer = window.setTimeout(() => {
      void runFindQuery();
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [findQuery, caseSensitive, findOpen, runFindQuery, clearMatchStats]);

  useEffect(() => {
    if (!focused && findOpen) closeFind();
  }, [focused, findOpen, closeFind]);

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => fitRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [active]);

  useEffect(() => {
    if (!focused || findOpen) return;
    const id = requestAnimationFrame(() => {
      fitRef.current?.();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [focused, sessionId, findOpen]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <TerminalFindBar
        open={findOpen}
        focusKey={findInputFocusKey}
        query={findQuery}
        caseSensitive={caseSensitive}
        matchIndex={matchIndex}
        matchCount={matchCount}
        matchCapped={matchCapped}
        onQueryChange={setFindQuery}
        onCaseSensitiveChange={setCaseSensitive}
        onNext={() => void runSearch("next")}
        onPrevious={() => void runSearch("prev")}
        onClose={closeFind}
      />
      {hasNewOutput && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            scrollToBottomRef.current?.();
          }}
          className="pointer-events-auto absolute bottom-3 right-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#3d3d42] bg-[#1e1e22]/95 px-2.5 py-1.5 text-[11px] font-medium text-[#ececef] shadow-lg backdrop-blur-sm transition-colors hover:border-[#5a5a62] hover:bg-[#28282e]"
          title={t("terminal.scrollToBottom")}
        >
          <span aria-hidden>↓</span>
          <span>{t("terminal.newOutput")}</span>
        </button>
      )}
    </div>
  );
}
