import { useEffect, useMemo } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
 * Raycast-style command palette backed by shadcn/cmdk. Filters commands by query,
 * supports keyboard navigation, Enter to run, Esc/backdrop to dismiss.
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

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of commands) {
      const list = map.get(command.group) ?? [];
      list.push(command);
      map.set(command.group, list);
    }
    return [...map.entries()];
  }, [commands]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-overlay px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-border shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={t("cmd.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("cmd.empty")}</CommandEmpty>
            {grouped.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.title} ${c.keywords ?? ""} ${c.group}`}
                    onSelect={() => {
                      onClose();
                      c.run();
                    }}
                  >
                    {c.icon && (
                      <span aria-hidden className="w-4 text-center">
                        {c.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate">{c.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
