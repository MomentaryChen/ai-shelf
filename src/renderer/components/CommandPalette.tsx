import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useLocale } from "../i18n/LocaleProvider";

/** Two-step "type a value then run" flow for a parameterized command. */
export interface CommandInputSpec {
  /** Placeholder shown in the value field (already localized by the caller). */
  placeholder?: string;
  /** Pre-filled value when the input opens. */
  initialValue?: string;
  /** Called with the trimmed value when the user presses Enter. */
  onSubmit: (value: string) => void;
}

export interface Command {
  id: string;
  title: string;
  group: string;
  icon?: string;
  /** Extra space-separated terms the fuzzy filter should also match against. */
  keywords?: string;
  /** Hotkey hint rendered at the right of the row (e.g. "Ctrl+1"). */
  shortcut?: string;
  /** Only show this command once the user types — keeps the default list tidy. */
  hideWhenEmpty?: boolean;
  /** When set, selecting the command opens a value prompt instead of running. */
  input?: CommandInputSpec;
  run?: () => void;
}

const MRU_KEY = "ai-cmd-palette-mru";
const MRU_MAX = 24;
const RECENT_SHOWN = 6;

function loadMru(): string[] {
  try {
    const raw = localStorage.getItem(MRU_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveMru(ids: string[]): void {
  try {
    localStorage.setItem(MRU_KEY, JSON.stringify(ids.slice(0, MRU_MAX)));
  } catch {
    /* ignore */
  }
}

function CommandRow({
  command,
  keyPrefix = "",
  onRun,
}: {
  command: Command;
  keyPrefix?: string;
  onRun: (command: Command) => void;
}) {
  return (
    <CommandItem
      value={`${keyPrefix}${command.title} ${command.keywords ?? ""} ${command.group}`}
      onSelect={() => onRun(command)}
    >
      {command.icon && (
        <span aria-hidden className="w-4 text-center">
          {command.icon}
        </span>
      )}
      <span className="flex-1 truncate">{command.title}</span>
      {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
    </CommandItem>
  );
}

/**
 * Raycast-style command palette backed by shadcn/cmdk. Filters commands by query,
 * supports keyboard navigation, Enter to run, Esc/backdrop to dismiss. Also surfaces
 * recently used commands, hotkey hints, and a two-step prompt for parameterized commands.
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
  const [mru, setMru] = useState<string[]>(loadMru);
  /** Active parameterized command awaiting a value, or null for the normal list. */
  const [prompt, setPrompt] = useState<Command | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement>(null);

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setPrompt(null);
      setPromptValue("");
    }
  }, [open]);

  // Focus the value field when entering prompt mode.
  useEffect(() => {
    if (prompt) promptInputRef.current?.focus();
  }, [prompt]);

  const recordRun = useCallback((id: string) => {
    setMru((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MRU_MAX);
      saveMru(next);
      return next;
    });
  }, []);

  const runCommand = useCallback(
    (command: Command) => {
      if (command.input) {
        recordRun(command.id);
        setPrompt(command);
        setPromptValue(command.input.initialValue ?? "");
        setQuery("");
        return;
      }
      recordRun(command.id);
      onClose();
      command.run?.();
    },
    [onClose, recordRun],
  );

  const submitPrompt = useCallback(() => {
    if (!prompt?.input) return;
    const value = promptValue.trim();
    if (!value) return;
    onClose();
    prompt.input.onSubmit(value);
  }, [prompt, promptValue, onClose]);

  // Esc backs out of prompt mode first, then closes the palette.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (prompt) setPrompt(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, prompt]);

  const hasQuery = query.trim().length > 0;

  // Dynamic-search commands only appear once the user types.
  const visible = useMemo(
    () => (hasQuery ? commands : commands.filter((c) => !c.hideWhenEmpty)),
    [commands, hasQuery],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of visible) {
      const list = map.get(command.group) ?? [];
      list.push(command);
      map.set(command.group, list);
    }
    return [...map.entries()];
  }, [visible]);

  // Recently used commands, surfaced at the top when not searching.
  const recent = useMemo(() => {
    if (hasQuery) return [];
    const byId = new Map(visible.filter((c) => !c.input).map((c) => [c.id, c]));
    const out: Command[] = [];
    for (const id of mru) {
      const c = byId.get(id);
      if (c) out.push(c);
      if (out.length >= RECENT_SHOWN) break;
    }
    return out;
  }, [mru, visible, hasQuery]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-overlay px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="warm-rise w-full max-w-[560px] overflow-hidden rounded-[28px] border border-sand bg-bg-elevated warm-shadow-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {prompt ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm">
              {prompt.icon && (
                <span aria-hidden className="w-4 text-center">
                  {prompt.icon}
                </span>
              )}
              <span className="text-text-secondary">{prompt.title}</span>
            </div>
            <input
              ref={promptInputRef}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder={prompt.input?.placeholder}
              className="h-12 w-full bg-transparent px-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <div className="border-t border-border px-4 py-2 text-[11px] text-text-tertiary">
              {t("cmd.input.hint")}
            </div>
          </div>
        ) : (
          <Command shouldFilter>
            <CommandInput
              placeholder={t("cmd.placeholder")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{t("cmd.empty")}</CommandEmpty>
              {recent.length > 0 && (
                <CommandGroup heading={t("cmd.group.recent")}>
                  {recent.map((c) => (
                    <CommandRow
                      key={`recent:${c.id}`}
                      command={c}
                      keyPrefix="recent:"
                      onRun={runCommand}
                    />
                  ))}
                </CommandGroup>
              )}
              {grouped.map(([group, items]) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((c) => (
                    <CommandRow key={c.id} command={c} onRun={runCommand} />
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        )}
      </div>
    </div>
  );
}
