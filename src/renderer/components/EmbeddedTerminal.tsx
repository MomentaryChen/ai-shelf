import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string;
  bg?: string;
  active?: boolean;
  onExit: () => void;
}

export function EmbeddedTerminal({ sessionId, bg, active = true, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const fitRef = useRef<(() => void) | null>(null);
  const stableOnExit = useCallback(onExit, []); // eslint-disable-line react-hooks/exhaustive-deps

  activeRef.current = active;

  useEffect(() => {
    if (!containerRef.current) return;
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
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    let rafId = 0;
    const fit = () => {
      if (!activeRef.current) return;
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      fitAddon.fit();
      window.api.ptyResize(sessionId, term.cols, term.rows);
    };
    fitRef.current = fit;

    const scheduleFit = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    };

    scheduleFit();

    const offData = window.api.onPtyData(({ sessionId: sid, data }) => {
      if (sid === sessionId) term.write(data);
    });
    const offExit = window.api.onPtyExit(({ sessionId: sid }) => {
      if (sid !== sessionId) return;
      term.writeln("\r\n\x1b[90m[process exited — press any key to close]\x1b[0m");
      const d = term.onKey(() => {
        d.dispose();
        stableOnExit();
      });
    });

    term.onData((data) => window.api.ptyWrite(sessionId, data));

    const ro = new ResizeObserver(scheduleFit);
    ro.observe(containerRef.current);

    term.focus();

    return () => {
      cancelAnimationFrame(rafId);
      fitRef.current = null;
      offData();
      offExit();
      window.api.ptyKill(sessionId);
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, stableOnExit]);

  // Refit once when panel becomes visible again (hidden → shown skips zero-size resize)
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => fitRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [active]);

  return <div ref={containerRef} className="h-full w-full" />;
}
