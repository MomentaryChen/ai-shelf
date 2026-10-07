import { Fragment, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

export interface NavItem<T extends string> {
  id: T;
  icon: ReactNode;
  labelKey: MessageKey;
  /** Consecutive items sharing a group render under one sub-heading. */
  groupKey?: MessageKey;
  /** Extra search terms for the rail filter (English, space separated). */
  keywords?: string;
}

/**
 * Left rail for inventory / tools mode — icon + label list, one active item.
 * Collapses to an icon-only rail below `lg` so the content column keeps room
 * when the Electron window is near its 900px minimum.
 */
export function InventoryNav<T extends string>({
  items,
  active,
  onSelect,
  disabled = false,
  badges,
  sectionLabelKey = "app.nav.sections",
  filterable = false,
}: {
  items: NavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  disabled?: boolean;
  badges?: Partial<Record<T, number>>;
  /** Left-rail section title (Inventory vs Tools, etc.). */
  sectionLabelKey?: MessageKey;
  /** Show a filter box above the list (wide rail only). */
  filterable?: boolean;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return items;
    return items.filter((it) =>
      `${t(it.labelKey)} ${it.id} ${it.keywords ?? ""}`.toLowerCase().includes(needle),
    );
  }, [items, needle, t]);

  const focusItem = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]");
    if (!buttons || buttons.length === 0) return;
    buttons[(index + buttons.length) % buttons.length]?.focus();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]") ?? [],
    );
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    if (e.key === "Home") focusItem(0);
    else if (e.key === "End") focusItem(buttons.length - 1);
    else focusItem(current + (e.key === "ArrowDown" ? 1 : -1));
  };

  const onFilterKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && visible[0]) {
      e.preventDefault();
      onSelect(visible[0].id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
    }
  };

  return (
    <nav
      aria-label={t(sectionLabelKey)}
      className="flex w-14 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-bg-secondary/40 p-1.5 lg:w-52 lg:p-2"
    >
      <div className="hidden px-2 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase lg:block">
        {t(sectionLabelKey)}
      </div>
      {filterable && (
        <div className="relative mb-1.5 hidden lg:block">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFilterKeyDown}
            placeholder={t("app.nav.filterTools")}
            aria-label={t("app.nav.filterTools")}
            className="h-8 w-full rounded-lg border border-border bg-bg-card pr-7 pl-8 text-[12.5px] text-text-primary transition-[border-color,box-shadow] duration-200 placeholder:text-text-tertiary focus:border-accent/50 focus:shadow-[0_0_0_2px_rgba(201,123,90,0.25)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear"
              className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-secondary hover:text-text-primary"
            >
              <X aria-hidden className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <div ref={listRef} onKeyDown={onListKeyDown} className="flex flex-col gap-0.5">
        {visible.length === 0 && (
          <p className="hidden px-2 py-3 text-[12px] text-text-tertiary lg:block">
            {t("app.nav.noMatch", { query: query.trim() })}
          </p>
        )}
        {visible.map((it, i) => {
          const isActive = it.id === active;
          const badge = badges?.[it.id];
          const label = t(it.labelKey);
          const showGroup = !needle && it.groupKey && it.groupKey !== visible[i - 1]?.groupKey;
          return (
            <Fragment key={it.id}>
              {showGroup && (
                <>
                  {i > 0 && (
                    <div aria-hidden className="mx-2 my-1.5 h-px bg-border/70 lg:hidden" />
                  )}
                  <div className="hidden px-2 pt-2.5 pb-1 text-[11px] font-medium text-text-tertiary first:pt-0.5 lg:block">
                    {t(it.groupKey!)}
                  </div>
                </>
              )}
              <button
                type="button"
                data-nav-item
                disabled={disabled}
                title={label}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(it.id)}
                className={`group relative flex items-center justify-center gap-2.5 rounded-xl py-1.5 text-left text-[13px] transition-[color,background-color,transform] duration-200 lg:justify-start lg:pr-2.5 lg:pl-2 ${
                  disabled
                    ? "cursor-not-allowed text-text-tertiary opacity-50"
                    : isActive
                      ? "bg-accent-soft font-medium text-accent"
                      : "cursor-pointer text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent transition-[opacity,transform] duration-200 ${
                    isActive ? "scale-y-100 opacity-100" : "scale-y-75 opacity-0"
                  }`}
                />
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-[color,background-color,box-shadow] duration-200 ${
                    isActive
                      ? "warm-shadow-accent bg-accent text-on-accent"
                      : "bg-bg-secondary text-text-secondary group-hover:text-accent"
                  }`}
                >
                  {it.icon}
                </span>
                <span className="hidden min-w-0 flex-1 truncate lg:block">{label}</span>
                {badge != null && badge > 0 && (
                  <span
                    aria-label={`${badge} alerts`}
                    className="absolute top-1.5 right-1.5 h-2 w-2 shrink-0 rounded-full bg-fail lg:static lg:ml-0"
                  />
                )}
              </button>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
