import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

export interface NavItem<T extends string> {
  id: T;
  icon: string;
  labelKey: MessageKey;
}

/**
 * Left rail for inventory mode — icon + label list, one active item. Replaces
 * the old top tab strip so the section set can grow without crowding the header.
 */
export function InventoryNav<T extends string>({
  items,
  active,
  onSelect,
  disabled = false,
  badges,
}: {
  items: NavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  disabled?: boolean;
  badges?: Partial<Record<T, number>>;
}) {
  const { t } = useLocale();
  return (
    <nav
      aria-label={t("app.nav.sections")}
      className="flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-bg-secondary/40 p-2"
    >
      <div className="px-2 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">
        {t("app.nav.sections")}
      </div>
      {items.map((it) => {
        const isActive = it.id === active;
        const badge = badges?.[it.id];
        return (
          <button
            key={it.id}
            type="button"
            disabled={disabled}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(it.id)}
            className={`relative flex items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-3 text-left text-[13px] transition-[color,background-color,transform] duration-200 ${
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
            <span aria-hidden className="w-4 text-center text-[15px]">
              {it.icon}
            </span>
            <span className="flex-1 truncate">{t(it.labelKey)}</span>
            {badge != null && badge > 0 && (
              <span
                aria-label={`${badge} alerts`}
                className="h-2 w-2 shrink-0 rounded-full bg-fail"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
