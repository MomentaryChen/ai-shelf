import { useEffect, useRef } from "react";
import { useLocale } from "../i18n/LocaleProvider";
interface Props {
  open: boolean;
  /** Increment to (re)focus the search input without stealing focus back to xterm. */
  focusKey: number;
  query: string;
  caseSensitive: boolean;
  matchIndex: number;
  /** Matches in full PTY session transcript. */
  matchCount: number;
  matchCapped: boolean;
  onQueryChange: (value: string) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

function formatCount(n: number, capped: boolean): string {
  return capped ? `${n}+` : String(n);
}

export function TerminalFindBar({
  open,
  focusKey,
  query,
  caseSensitive,
  matchIndex,
  matchCount,
  matchCapped,
  onQueryChange,
  onCaseSensitiveChange,
  onNext,
  onPrevious,
  onClose,
}: Props) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const selectAll = !wasOpenRef.current;
    wasOpenRef.current = true;

    let cancelled = false;
    const focusInput = () => {
      if (cancelled) return;
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (selectAll) {
        el.select();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(focusInput));
    return () => {
      cancelled = true;
    };
  }, [open, focusKey]);

  if (!open) return null;

  const hasQuery = query.length > 0;
  let status = "";
  if (hasQuery) {
    if (matchCount === 0) {
      status = t("find.noMatch");
    } else {
      status = `${matchIndex} / ${formatCount(matchCount, matchCapped)}`;
    }
  }

  return (
    <div
      className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border border-[#333] bg-[#1a1a1a]/95 px-2 py-1.5 shadow-lg backdrop-blur-sm"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrevious();
            else onNext();
          }
        }}
        placeholder={t("find.placeholder")}
        className="w-44 min-w-0 rounded border border-[#333] bg-[#0f0f0f] px-2 py-1 text-[12px] text-[#e8e8e8] outline-none ring-[#3b78ff] focus:ring-1"
        aria-label={t("find.aria")}
      />
      <label className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-[#8a8a8a]">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => onCaseSensitiveChange(e.target.checked)}
          className="accent-[#3b78ff]"
        />
        Aa
      </label>
      <button
        type="button"
        title={t("find.prev")}
        onClick={onPrevious}
        disabled={!hasQuery || matchCount === 0}
        className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] text-[#c0c0c0] hover:bg-[#2a2a2a] disabled:cursor-default disabled:text-[#555]"
      >
        ↑
      </button>
      <button
        type="button"
        title={t("find.next")}
        onClick={onNext}
        disabled={!hasQuery || matchCount === 0}
        className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] text-[#c0c0c0] hover:bg-[#2a2a2a] disabled:cursor-default disabled:text-[#555]"
      >
        ↓
      </button>
      {status ? (
        <span
          className="max-w-[14rem] truncate text-center text-[11px] tabular-nums text-[#6b6b6b]"
          title={status}
        >
          {status}
        </span>
      ) : null}
      <button
        type="button"
        title={t("find.close")}
        onClick={onClose}
        className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] text-[#8a8a8a] hover:bg-[#2a2a2a] hover:text-[#e8e8e8]"
      >
        ✕
      </button>
    </div>
  );
}
