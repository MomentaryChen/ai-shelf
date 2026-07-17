import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  open: boolean;
  /** Increment to (re)focus the search input without stealing focus back to xterm. */
  focusKey: number;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  matchIndex: number;
  /** Matches in xterm scrollback (navigable). */
  matchCount: number;
  matchCapped: boolean;
  /** Extra hits in the PTY char buffer outside the current xterm view. */
  outsideScrollback: number;
  outsideCapped: boolean;
  invalidRegex: boolean;
  onQueryChange: (value: string) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onWholeWordChange: (value: boolean) => void;
  onRegexChange: (value: boolean) => void;
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
  wholeWord,
  regex,
  matchIndex,
  matchCount,
  matchCapped,
  outsideScrollback,
  outsideCapped,
  invalidRegex,
  onQueryChange,
  onCaseSensitiveChange,
  onWholeWordChange,
  onRegexChange,
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
    if (invalidRegex) {
      status = t("find.invalidRegex");
    } else if (matchCount === 0 && outsideScrollback === 0) {
      status = t("find.noMatch");
    } else if (matchCount === 0 && outsideScrollback > 0) {
      status = t("find.beyondOnly", {
        count: formatCount(outsideScrollback, outsideCapped),
      });
    } else {
      status = `${matchIndex} / ${formatCount(matchCount, matchCapped)}`;
      if (outsideScrollback > 0) {
        status += ` · ${t("find.beyond", {
          count: formatCount(outsideScrollback, outsideCapped),
        })}`;
      }
    }
  }

  return (
    <div
      className="pointer-events-auto absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-lg border border-chrome-border-strong bg-chrome-surface-hover/95 px-2 py-1.5 shadow-pop backdrop-blur-sm"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <Input
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
        className="h-auto w-44 min-w-0 border-chrome-border-strong bg-chrome-bg px-2 py-1 text-[12px] text-chrome-text focus-visible:border-chrome-ui-accent focus-visible:ring-chrome-ui-accent/40"
      />
      <Label
        className="flex cursor-pointer select-none items-center gap-1 text-[11px] font-normal text-chrome-text-muted"
        title={t("find.caseSensitive")}
      >
        <Checkbox
          checked={caseSensitive}
          onCheckedChange={(v) => onCaseSensitiveChange(v === true)}
        />
        Aa
      </Label>
      <Label
        className="flex cursor-pointer select-none items-center gap-1 text-[11px] font-normal text-chrome-text-muted"
        title={t("find.wholeWord")}
      >
        <Checkbox
          checked={wholeWord}
          onCheckedChange={(v) => onWholeWordChange(v === true)}
        />
        Ab
      </Label>
      <Label
        className="flex cursor-pointer select-none items-center gap-1 text-[11px] font-normal text-chrome-text-muted"
        title={t("find.regex")}
      >
        <Checkbox
          checked={regex}
          onCheckedChange={(v) => onRegexChange(v === true)}
        />
        .*
      </Label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={t("find.prev")}
        onClick={onPrevious}
        disabled={!hasQuery || matchCount === 0}
        className="size-7 text-[12px] text-chrome-text-secondary hover:bg-chrome-surface-hover hover:text-chrome-text"
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={t("find.next")}
        onClick={onNext}
        disabled={!hasQuery || matchCount === 0}
        className="size-7 text-[12px] text-chrome-text-secondary hover:bg-chrome-surface-hover hover:text-chrome-text"
      >
        ↓
      </Button>
      {status ? (
        <span
          className="max-w-[16rem] truncate text-center text-[11px] tabular-nums text-chrome-text-subtle"
          title={status}
        >
          {status}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={t("find.close")}
        onClick={onClose}
        className="size-7 text-[12px] text-chrome-text-muted hover:bg-chrome-surface-hover hover:text-chrome-text"
      >
        ✕
      </Button>
    </div>
  );
}
