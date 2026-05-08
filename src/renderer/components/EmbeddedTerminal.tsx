import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string;
  bg?: string;
  onExit: () => void;
}

export function EmbeddedTerminal({ sessionId, bg, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stableOnExit = useCallback(onExit, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!containerRef.current) return;
    const background = bg || getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim() || "#0f172a";

    const term = new Terminal({
      theme: {
        background,
        foreground: "#cccccc",
        cursor: "#ffffff",
        cursorAccent: background,
        selectionBackground: "#ffffff40",
        // Windows Terminal "Campbell" colour scheme
        black:          "#0c0c0c", brightBlack:   "#767676",
        red:            "#c50f1f", brightRed:     "#e74856",
        green:          "#13a10e", brightGreen:   "#16c60c",
        yellow:         "#c19c00", brightYellow:  "#f9f1a5",
        blue:           "#0037da", brightBlue:    "#3b78ff",
        magenta:        "#881798", brightMagenta: "#b4009e",
        cyan:           "#3a96dd", brightCyan:    "#61d6d6",
        white:          "#cccccc", brightWhite:   "#f2f2f2",
      },
      fontFamily: "'CaskaydiaCove Nerd Font', 'CaskaydiaMono Nerd Font', 'Cascadia Code NF', 'FiraCode Nerd Font', 'JetBrainsMono Nerd Font', 'MesloLGS NF', 'Hack Nerd Font', 'Consolas', 'Courier New', monospace",
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
    fitAddon.fit();

    // PTY output → terminal display
    const offData = window.api.onPtyData(({ sessionId: sid, data }) => {
      if (sid === sessionId) term.write(data);
    });
    const offExit = window.api.onPtyExit(({ sessionId: sid }) => {
      if (sid !== sessionId) return;
      term.writeln("\r\n\x1b[90m[process exited — press any key to close]\x1b[0m");
      const d = term.onKey(() => { d.dispose(); stableOnExit(); });
    });

    // Terminal input → PTY stdin
    term.onData((data) => window.api.ptyWrite(sessionId, data));

    // Auto-resize
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      window.api.ptyResize(sessionId, term.cols, term.rows);
    });
    ro.observe(containerRef.current);

    term.focus();

    return () => {
      offData();
      offExit();
      window.api.ptyKill(sessionId);
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, stableOnExit]);

  return <div ref={containerRef} className="h-full w-full" />;
}
