import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";

export interface Command {
  id: string;
  title: string;
  group: string;
  icon?: string;
  /** Extra space-separated terms the fuzzy filter should also match against. */
  keywords?: string;
  run: () => void;
}

/**
 * Raycast-style command palette. Presentational + keyboard-driven: filters the
 * passed commands by the query, supports ↑/↓ to move, Enter to run, Esc/backdrop
 * to dismiss. Rendering nothing when closed keeps it cheap.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.title} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q),
    );
  }, [query, commands]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-overlay px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <span className="text-text-tertiary" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("cmd.placeholder")}
            className="w-full bg-transparent py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-tertiary">{t("cmd.empty")}</p>
          ) : (
            filtered.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {showGroup && (
                    <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">
                      {c.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(c)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      i === active
                        ? "bg-accent-soft text-text-primary"
                        : "text-text-secondary hover:bg-bg-secondary"
                    }`}
                  >
                    {c.icon && (
                      <span aria-hidden className="w-4 text-center">
                        {c.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate">{c.title}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
