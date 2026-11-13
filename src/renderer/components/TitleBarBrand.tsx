import { useEffect, useState } from "react";
import appIcon from "../../assets/icon.png";

export type TitleBarTone = "chrome" | "default";

/**
 * Element in the main window's title bar that terminal mode fills with its
 * profile chip and pane actions. Windows without it keep their own top bar.
 */
export const TITLE_BAR_TERMINAL_SLOT_ID = "app-title-bar-terminal-slot";

/** CSS variables that paint the title bar for each tone (see App header). */
const TONE_VARS: Record<TitleBarTone, { bg: string; fg: string }> = {
  chrome: { bg: "--color-chrome-bg", fg: "--color-chrome-text-secondary" },
  default: { bg: "--color-bg-primary", fg: "--color-text-secondary" },
};

/** Resolve a theme token to an `rgb()` string Electron can parse. */
function resolveColor(varName: string, prop: "color" | "backgroundColor"): string | undefined {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style[prop] = `var(${varName})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe)[prop];
  probe.remove();
  return value || undefined;
}

/**
 * Keep the native caption buttons (min / max / close, drawn by the OS on Windows/Linux)
 * painted with the same colors as the in-app title bar as mode and theme change.
 */
export function useTitleBarOverlaySync(tone: TitleBarTone): void {
  useEffect(() => {
    const api = window.api;
    if (!api?.setTitleBarOverlay) return;
    const sync = () => {
      const vars = TONE_VARS[tone];
      api.setTitleBarOverlay?.({
        color: resolveColor(vars.bg, "backgroundColor"),
        symbolColor: resolveColor(vars.fg, "color"),
      });
    };
    sync();
    window.addEventListener("app-theme-change", sync);
    return () => window.removeEventListener("app-theme-change", sync);
  }, [tone]);
}

/** App mark + name + version shown at the start of the title bar. */
export function TitleBarBrand({ tone }: { tone: TitleBarTone }) {
  const [info, setInfo] = useState<{ version: string; detail: string } | null>(null);

  useEffect(() => {
    let alive = true;
    window.api
      ?.getSelfInfo?.()
      .then((self) => {
        if (!alive) return;
        const git = [self.branch, self.commitShort].filter(Boolean).join(" @ ");
        setInfo({
          version: self.version,
          detail: git ? `${git}${self.dirty ? " (dirty)" : ""}` : "",
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const chrome = tone === "chrome";
  return (
    <div
      className="flex shrink-0 select-none items-center gap-2 pr-1 pl-1"
      title={info ? `AI Shelf v${info.version}${info.detail ? ` — ${info.detail}` : ""}` : "AI Shelf"}
    >
      <img src={appIcon} alt="" aria-hidden draggable={false} className="h-[18px] w-[18px] rounded-[5px]" />
      <span
        className={`text-[12.5px] font-semibold tracking-[0.01em] ${
          chrome ? "text-chrome-text" : "text-text-primary"
        }`}
      >
        AI Shelf
      </span>
      {info && (
        <span
          className={`rounded-full border px-1.5 py-px font-mono text-[10px] leading-[14px] ${
            chrome
              ? "border-chrome-border-subtle text-chrome-text-faint"
              : "border-border-subtle text-text-tertiary"
          }`}
        >
          v{info.version}
        </span>
      )}
    </div>
  );
}
