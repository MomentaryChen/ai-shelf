import type { ReactElement } from "react";
import { Columns3, LayoutGrid, LayoutPanelLeft, Rows3, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { shortcutKeys } from "../shortcuts/shortcut-registry";
import type { ShortcutId } from "../shortcuts/keybindings";
import { LAYOUT_PRESETS, type LayoutPreset } from "../terminal/layout-presets";

const PRESET_ITEMS: Record<LayoutPreset, { icon: LucideIcon; labelKey: MessageKey; shortcut: ShortcutId }> = {
  columns: { icon: Columns3, labelKey: "pane.layout.columns", shortcut: "layoutColumns" },
  rows: { icon: Rows3, labelKey: "pane.layout.rows", shortcut: "layoutRows" },
  grid: { icon: LayoutGrid, labelKey: "pane.layout.grid", shortcut: "layoutGrid" },
  "main-side": { icon: LayoutPanelLeft, labelKey: "pane.layout.mainSide", shortcut: "layoutMainSide" },
};

/**
 * "Layout" dropdown: rearrange the panes on screen into a preset. `trigger` is
 * the button element (rendered through `asChild`); it is disabled here when
 * fewer than two panes are shown.
 */
export function LayoutPresetMenu({
  paneCount,
  onSelect,
  trigger,
}: {
  /** Panes on screen (minimized / popped-out panes excluded). */
  paneCount: number;
  onSelect: (preset: LayoutPreset) => void;
  trigger: ReactElement<{ disabled?: boolean }>;
}) {
  const { t } = useLocale();
  const enabled = paneCount >= 2;
  return (
    <DropdownMenu>
      <span title={enabled ? t("pane.layout.menuTitle") : t("pane.layout.needTwo")}>
        <DropdownMenuTrigger asChild disabled={!enabled}>
          {trigger}
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {LAYOUT_PRESETS.map((preset) => {
          const item = PRESET_ITEMS[preset];
          const Icon = item.icon;
          const keys = shortcutKeys(item.shortcut);
          return (
            <DropdownMenuItem key={preset} onSelect={() => onSelect(preset)}>
              <Icon aria-hidden />
              {t(item.labelKey)}
              {keys && <DropdownMenuShortcut>{keys}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
