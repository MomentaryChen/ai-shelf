import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { normalizePaneTitle } from "../utils/pane-label";
import { Input } from "@/components/ui/input";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  label: string;
  onRename: (title: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  title?: string;
}

export function EditablePaneTitle({
  label,
  onRename,
  className = "",
  inputClassName = "",
  disabled = false,
  title,
}: Props) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    onRename(normalizePaneTitle(draft) ?? "");
  }

  function cancel() {
    setEditing(false);
    setDraft(label);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={`h-auto min-w-0 flex-1 rounded border-chrome-border-hover bg-chrome-surface-raised px-1.5 py-0.5 text-[12px] text-chrome-text focus-visible:border-accent ${inputClassName}`}
        aria-label={t("pane.tabTitle")}
      />
    );
  }

  return (
    <span
      className={`min-w-0 flex-1 truncate ${disabled ? "" : "cursor-text"} ${className}`}
      title={title ?? (disabled ? label : t("pane.renameHint", { label }))}
      onDoubleClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        e.preventDefault();
        setDraft(label);
        setEditing(true);
      }}
    >
      {label}
    </span>
  );
}
