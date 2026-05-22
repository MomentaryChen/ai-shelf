import { useEffect, useRef } from "react";
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
      status = "無符合";
    } else {
      status = `${matchIndex} / ${formatCount(matchCount, matchCapped)}`;
    }
  }

  return (
    <div
      className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border border-chrome-border-strong bg-chrome-surface-hover/95 px-2 py-1.5 shadow-lg backdrop-blur-sm"
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
        placeholder="搜尋輸出…"
        className="w-44 min-w-0 rounded border border-chrome-border-strong bg-chrome-bg px-2 py-1 text-[12px] text-chrome-text outline-none ring-accent focus:ring-1"
        aria-label="搜尋終端機輸出"
      />
      <label className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-chrome-text-muted">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => onCaseSensitiveChange(e.target.checked)}
          className="accent-accent"
        />
        Aa
      </label>
      <button
        type="button"
        title="上一個 (Shift+Enter)"
        onClick={onPrevious}
        disabled={!hasQuery || matchCount === 0}
        className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] text-chrome-text-secondary hover:bg-chrome-surface-hover disabled:cursor-default disabled:text-chrome-text-dim"
      >
        ↑
      </button>
      <button
        type="button"
        title="下一個 (Enter)"
        onClick={onNext}
        disabled={!hasQuery || matchCount === 0}
        className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] text-chrome-text-secondary hover:bg-chrome-surface-hover disabled:cursor-default disabled:text-chrome-text-dim"
      >
        ↓
      </button>
      {status ? (
        <span
          className="max-w-[14rem] truncate text-center text-[11px] tabular-nums text-chrome-text-subtle"
          title={status}
        >
          {status}
        </span>
      ) : null}
      <button
        type="button"
        title="關閉 (Esc)"
        onClick={onClose}
        className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] text-chrome-text-muted hover:bg-chrome-surface-hover hover:text-chrome-text"
      >
        ✕
      </button>
    </div>
  );
}
