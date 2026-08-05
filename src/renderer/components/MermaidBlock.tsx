import { useEffect, useId, useRef, useState } from "react";
import { useAppThemeRevision } from "../app-theme";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  chart: string;
  className?: string;
};

type MermaidApi = typeof import("mermaid").default;

const RENDER_DEBOUNCE_MS = 280;

let mermaidModule: MermaidApi | null = null;
let lastTheme: "dark" | "neutral" | null = null;

function mermaidThemeFromDom(): "dark" | "neutral" {
  const theme = document.documentElement.dataset.appTheme ?? "warm";
  return theme === "dark" || theme === "contrast" ? "dark" : "neutral";
}

async function loadMermaid(theme: "dark" | "neutral"): Promise<MermaidApi> {
  if (!mermaidModule) {
    const mod = await import("mermaid");
    mermaidModule = mod.default;
  }
  if (lastTheme !== theme) {
    mermaidModule.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme,
      fontFamily: "inherit",
    });
    lastTheme = theme;
  }
  return mermaidModule;
}

export function MermaidBlock({ chart, className = "" }: Props) {
  const { t } = useLocale();
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSeqRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const themeRevision = useAppThemeRevision();

  useEffect(() => {
    let cancelled = false;
    const trimmed = chart.trim();
    if (!trimmed) {
      setBusy(false);
      setError(null);
      if (containerRef.current) containerRef.current.innerHTML = "";
      return;
    }

    setBusy(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        const theme = mermaidThemeFromDom();
        const seq = ++renderSeqRef.current;
        const renderId = `mermaid-${reactId}-${themeRevision}-${seq}`;

        // Drop the previous diagram so a broken edit does not keep showing
        // the last successful SVG while we re-render.
        if (containerRef.current) containerRef.current.innerHTML = "";

        try {
          const mermaid = await loadMermaid(theme);
          const { svg } = await mermaid.render(renderId, trimmed);
          if (cancelled || seq !== renderSeqRef.current) return;
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
          setError(null);
        } catch (err) {
          if (cancelled || seq !== renderSeqRef.current) return;
          if (containerRef.current) containerRef.current.innerHTML = "";
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!cancelled && seq === renderSeqRef.current) setBusy(false);
        }
      })();
    }, RENDER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chart, reactId, themeRevision]);

  if (error) {
    return (
      <div
        role="alert"
        className={`mb-3 overflow-x-auto rounded-[16px] border border-fail/40 bg-bg-primary p-4 text-[12px] text-fail last:mb-0 ${className}`}
      >
        <p className="mb-2 font-medium text-text-primary">{t("markdown.mermaid.errorTitle")}</p>
        <pre className="whitespace-pre-wrap font-mono leading-relaxed">{error}</pre>
      </div>
    );
  }

  return (
    <div
      className={`mb-3 overflow-x-auto rounded-[16px] border border-border bg-bg-primary p-4 last:mb-0 ${className}`}
      aria-busy={busy || undefined}
    >
      <div ref={containerRef} className="flex min-h-[1.5rem] justify-center [&_svg]:max-w-full" />
    </div>
  );
}
