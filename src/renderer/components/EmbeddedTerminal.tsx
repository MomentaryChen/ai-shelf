import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { bindTerminalClipboard } from "../terminal/xterm-clipboard";
import { bindTerminalLinks } from "../terminal/xterm-links";

interface Props {
  sessionId: string;
  bg?: string;
  active?: boolean;
  focused?: boolean;
  onExit: () => void;
  onSessionLost?: (sessionId: string) => void;
  onWrite?: (data: string, sessionId: string) => void;
}

export function EmbeddedTerminal({
  sessionId,
  bg,
  active = true,
  focused = true,
  onExit,
  onSessionLost,
  onWrite,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const activeRef = useRef(active);
  const onWriteRef = useRef(onWrite);
  const onSessionLostRef = useRef(onSessionLost);
  const fitRef = useRef<(() => void) | null>(null);
  const stableOnExit = useCallback(onExit, []); // eslint-disable-line react-hooks/exhaustive-deps

  activeRef.current = active;
  onWriteRef.current = onWrite;
  onSessionLostRef.current = onSessionLost;

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
      fontFamily:
        "'CaskaydiaCove Nerd Font', 'CaskaydiaMono Nerd Font', 'Cascadia Code NF', 'FiraCode Nerd Font', 'JetBrainsMono Nerd Font', 'MesloLGS NF', 'Hack Nerd Font', 'Consolas', 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      allowProposedApi: false,
      rightClickSelectsWord: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    termRef.current = term;
    const unbindClipboard = bindTerminalClipboard(term, el);
    const unbindLinks = bindTerminalLinks(term);

    const pending: string[] = [];
    let opened = true;
    let rafId = 0;
    let wakeTimer = 0;
    let statusTimer = 0;
    let receivedBytes = 0;

    const writeSafe = (data: string) => {
      if (!opened) {
        pending.push(data);
        return;
      }
      try {
        term.write(data);
      } catch (err) {
        console.error("[xterm-write]", sessionId, err);
      }
    };

    const flushPending = () => {
      if (!opened || pending.length === 0) return;
      const chunk = pending.splice(0, pending.length).join("");
      try {
        term.write(chunk);
      } catch (err) {
        console.error("[xterm-flush]", sessionId, err);
      }
    };

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

    const offData = window.api.onPtyData(({ sessionId: sid, data }) => {
      if (sid !== sessionId) return;
      receivedBytes += data.length;
      writeSafe(data);
    });

    const offExit = window.api.onPtyExit(({ sessionId: sid }) => {
      if (sid !== sessionId) return;
      term.writeln("\r\n\x1b[90m[process exited — press any key to close]\x1b[0m");
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
        term.writeln("\r\n\x1b[33m[terminal] waiting for shell output — click here and press Enter\x1b[0m");
      }, 2500);
    });

    const ro = new ResizeObserver(scheduleFit);
    ro.observe(el);

    const onPointerDown = () => term.focus();
    el.addEventListener("pointerdown", onPointerDown);

    return () => {
      cancelled = true;
      opened = false;
      window.clearTimeout(wakeTimer);
      window.clearTimeout(statusTimer);
      cancelAnimationFrame(rafId);
      fitRef.current = null;
      termRef.current = null;
      offData();
      offExit();
      el.removeEventListener("pointerdown", onPointerDown);
      unbindClipboard();
      unbindLinks();
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, stableOnExit, bg]);

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => fitRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [active]);

  useEffect(() => {
    if (!focused) return;
    const id = requestAnimationFrame(() => {
      fitRef.current?.();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [focused, sessionId]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
