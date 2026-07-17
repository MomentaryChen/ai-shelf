import { useEffect, useRef, useCallback, useState, memo } from "react";
import { ArrowDown } from "lucide-react";
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
  type TerminalSearchFlags,
  SEARCH_DEBOUNCE_MS,
} from "../terminal/terminal-search";
import { bindTerminalLinks } from "../terminal/xterm-links";
import { registerTerminalClear } from "../terminal/terminal-session-actions";
import {
  copyTerminalOutputForIssue,
  exportTerminalOutput,
} from "../terminal/terminal-output-export";
import { getXtermTheme } from "../app-theme";
import { getAppBg } from "../chat-settings";
import { disposeTerminal } from "../terminal/xterm-dispose";
import { attachTerminalWebgl } from "../terminal/xterm-webgl";
import { TerminalFindBar } from "./TerminalFindBar";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  sessionId: string;
  bg?: string;
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  /** Use WebGL renderer when the GPU allows it (falls back to canvas). */
  webglEnabled?: boolean;
  rightClickPaste?: boolean;
  copyOnSelect?: boolean;
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

function EmbeddedTerminalInner({
  sessionId,
  bg,
  fontFamily,
  fontSize,
  scrollback,
  webglEnabled = true,
  rightClickPaste = true,
  copyOnSelect = true,
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
  const onRestartRef = useRef(onRestart);
  const onExitRef = useRef(onExit);
  const fitRef = useRef<(() => void) | null>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const [hasNewOutput, setHasNewOutput] = useState(false);
  const stableOnExit = useCallback(() => onExitRef.current(), []);

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCapped, setMatchCapped] = useState(false);
  const [outsideScrollback, setOutsideScrollback] = useState(0);
  const [outsideCapped, setOutsideCapped] = useState(false);
  const [invalidRegex, setInvalidRegex] = useState(false);
  const [findInputFocusKey, setFindInputFocusKey] = useState(0);

  const findOpenRef = useRef(false);
  const findQueryRef = useRef(findQuery);
  const searchFlagsRef = useRef<TerminalSearchFlags>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const matchIndexRef = useRef(0);
  const matchCountRef = useRef(0);
  const sessionMatchesRef = useRef<ResolvedSessionMatch[]>([]);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  findQueryRef.current = findQuery;
  searchFlagsRef.current = { caseSensitive, wholeWord, regex };
  matchIndexRef.current = matchIndex;
  matchCountRef.current = matchCount;

  const refocusFindInput = useCallback(() => {
    setFindInputFocusKey((k) => k + 1);
  }, []);

  const clearMatchStats = useCallback(() => {
    setMatchCount(0);
    setMatchIndex(0);
    setMatchCapped(false);
    setOutsideScrollback(0);
    setOutsideCapped(false);
    setInvalidRegex(false);
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
        searchFlagsRef.current,
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
        searchFlagsRef.current,
        searchRef.current,
      );
      sessionMatchesRef.current = snapshot.session;
      const total = snapshot.session.length;
      setMatchCount(total);
      setMatchCapped(snapshot.sessionCapped);
      setOutsideScrollback(snapshot.outsideScrollback);
      setOutsideCapped(snapshot.outsideCapped);
      setInvalidRegex(snapshot.invalidRegex);
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

  const copyOnSelectRef = useRef(copyOnSelect);
  copyOnSelectRef.current = copyOnSelect;

  activeRef.current = active;
  onWriteRef.current = onWrite;
  onSessionLostRef.current = onSessionLost;
  onRestartRef.current = onRestart;
  onExitRef.current = onExit;

  useEffect(() => {
    setHasNewOutput(false);
  }, [sessionId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const background = bg ?? getAppBg();

    const term = new Terminal({
      theme: getXtermTheme(background),
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
    const detachWebgl = webglEnabled ? attachTerminalWebgl(term) : () => {};
    const searchAddon = attachTerminalSearch(term);
    searchRef.current = searchAddon;

    let exited = false;
    let cancelled = false;

    const markExited = () => {
      if (cancelled || exited) return;
      exited = true;
      const wasAtBottom = isTerminalAtBottom(term);
      term.writeln("\r\n\x1b[90m[process exited — press any key to close]\x1b[0m");
      if (!wasAtBottom) setHasNewOutput(true);
      const d = term.onKey(() => {
        d.dispose();
        stableOnExit();
      });
    };

    const writePty = (data: string) => {
      if (cancelled || exited) return;
      void window.api.ptyWrite(sessionId, data).then((r) => {
        if (cancelled || r.success) return;
        markExited();
      });
    };

    const doClear = () => {
      term.clear();
      writePty("\x0c");
    };
    const doExportOutput = () => {
      void exportTerminalOutput(sessionId, sessionId);
    };
    const doCopyOutputForIssue = () => {
      void copyTerminalOutputForIssue(sessionId);
    };
    const unregisterClear = registerTerminalClear(sessionId, doClear);
    let pasteToThisPaneOnly = false;
    const unbindClipboard = bindTerminalClipboard(term, el, {
      onOpenFind: () => openFindRef.current(),
      onClear: doClear,
      onRestart: () => onRestartRef.current?.(),
      onExportOutput: doExportOutput,
      onCopyOutputForIssue: doCopyOutputForIssue,
      getRightClickPaste: () => rightClickPasteRef.current,
      getCopyOnSelect: () => copyOnSelectRef.current,
      onPaste: (text) => {
        pasteToThisPaneOnly = true;
        term.paste(text);
        pasteToThisPaneOnly = false;
      },
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
      if (cancelled || exited) return;
      const cols = Math.max(term.cols, 2);
      const rows = Math.max(term.rows, 2);
      void window.api.ptyResize(sessionId, cols, rows).then((r) => {
        if (cancelled || r.success) return;
        markExited();
      });
    };

    const fit = () => {
      const target = containerRef.current;
      if (!target || target.clientWidth === 0 || target.clientHeight === 0) return;
      try {
        // Always resize from proposeDimensions — FitAddon.fit() skips when cols/rows
        // are unchanged, which leaves stale canvas metrics after font load or flex settle.
        const dims = fitAddon.proposeDimensions();
        if (dims) term.resize(dims.cols, dims.rows);
        else fitAddon.fit();
      } catch {
        /* mid-layout */
      }
      syncPtySize();
    };

    fitRef.current = fit;

    let rafId2 = 0;
    const scheduleFit = () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(rafId2);
      rafId = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(fit);
      });
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
      markExited();
    });

    term.onData((data) => {
      if (cancelled || exited) return;
      if (pasteToThisPaneOnly) {
        writePty(data);
        return;
      }
      const write = onWriteRef.current;
      if (write) write(data, sessionId);
      else writePty(data);
    });

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
        if (cancelled || exited || receivedBytes > 0) return;
        writePty("\r");
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

    const onWindowResize = () => scheduleFit();
    window.addEventListener("resize", onWindowResize);

    void document.fonts.ready.then(() => {
      if (!cancelled) scheduleFit();
    });
    const onFontsLoadingDone = () => {
      if (cancelled) return;
      scheduleFit();
    };
    document.fonts.addEventListener("loadingdone", onFontsLoadingDone);

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
      cancelAnimationFrame(rafId2);
      fitRef.current = null;
      scrollToBottomRef.current = null;
      termRef.current = null;
      searchRef.current = null;
      offScroll.dispose();
      offData();
      offExit();
      el.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onWindowResize);
      document.fonts.removeEventListener("loadingdone", onFontsLoadingDone);
      unregisterClear();
      unbindClipboard();
      unbindLinks();
      detachWebgl();
      ro.disconnect();
      searchAddon.dispose();
      disposeTerminal(term);
    };
  }, [sessionId, stableOnExit, bg, fontFamily, fontSize, scrollback, webglEnabled]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const applyTheme = () => {
      const background = bg ?? getAppBg();
      term.options.theme = getXtermTheme(background);
    };
    applyTheme();
    window.addEventListener("app-theme-change", applyTheme);
    return () => window.removeEventListener("app-theme-change", applyTheme);
  }, [bg]);

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
  }, [findQuery, caseSensitive, wholeWord, regex, findOpen, runFindQuery, clearMatchStats]);

  useEffect(() => {
    if (!focused && findOpen) closeFind();
  }, [focused, findOpen, closeFind]);

  useEffect(() => {
    if (!active) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => fitRef.current?.());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [active]);

  useEffect(() => {
    if (!focused || findOpen) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        fitRef.current?.();
        termRef.current?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [focused, sessionId, findOpen]);

  return (
    <div
      className="absolute inset-0 isolate"
      data-terminal-overlay-open={findOpen ? "" : undefined}
    >
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-10">
        <TerminalFindBar
          open={findOpen}
          focusKey={findInputFocusKey}
          query={findQuery}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
          regex={regex}
          matchIndex={matchIndex}
          matchCount={matchCount}
          matchCapped={matchCapped}
          outsideScrollback={outsideScrollback}
          outsideCapped={outsideCapped}
          invalidRegex={invalidRegex}
          onQueryChange={setFindQuery}
          onCaseSensitiveChange={setCaseSensitive}
          onWholeWordChange={setWholeWord}
          onRegexChange={setRegex}
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
            className="pointer-events-auto absolute bottom-3 right-3 flex cursor-pointer items-center gap-1.5 rounded-lg border border-chrome-border-focus bg-chrome-surface-raised/95 px-2.5 py-1.5 text-[11px] font-medium text-chrome-text shadow-pop backdrop-blur-sm transition-colors hover:border-chrome-border-hover hover:bg-chrome-surface-hover-strong"
            title={t("terminal.scrollToBottom")}

          >
            <ArrowDown className="h-3 w-3" aria-hidden />
            <span>{t("terminal.newOutput")}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export const EmbeddedTerminal = memo(
  EmbeddedTerminalInner,
  (prev, next) =>
    prev.sessionId === next.sessionId &&
    prev.bg === next.bg &&
    prev.fontFamily === next.fontFamily &&
    prev.fontSize === next.fontSize &&
    prev.scrollback === next.scrollback &&
    prev.webglEnabled === next.webglEnabled &&
    prev.rightClickPaste === next.rightClickPaste &&
    prev.copyOnSelect === next.copyOnSelect &&
    prev.active === next.active &&
    prev.focused === next.focused,
);
