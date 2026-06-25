import { INVENTORY_TOOL_IDS } from "../../tools.js";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ToolLaunchArgs } from "../chat-settings";
import { useLocale } from "../i18n/LocaleProvider";
import { profileToolLabel } from "../utils/available-tools";
import { ToolLogo } from "./ToolLogo";

interface Props {
  compact?: boolean;
  args: ToolLaunchArgs;
  onChange: (args: ToolLaunchArgs) => void;
}

export function ToolLaunchArgsEditor({ compact = false, args, onChange }: Props) {
  const { t } = useLocale();

  function setToolArg(tool: string, value: string) {
    const trimmed = value.trim();
    const next = { ...args };
    if (trimmed) next[tool] = trimmed;
    else delete next[tool];
    onChange(next);
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5"}>
      {INVENTORY_TOOL_IDS.map((tool) => (
        <Label
          key={tool}
          className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5 font-normal sm:flex-row sm:items-center sm:gap-3"
        >
          <span className="flex min-w-[8.5rem] shrink-0 items-center gap-2 text-[13px] text-text-primary">
            <ToolLogo tool={tool} size={16} />
            {profileToolLabel(tool)}
          </span>
          <Input
            type="text"
            value={args[tool] ?? ""}
            onChange={(e) => setToolArg(tool, e.target.value)}
            placeholder={t("settings.toolLaunchArgs.placeholder")}
            spellCheck={false}
            className="min-w-0 flex-1 border-border bg-bg-secondary font-mono text-[12px] placeholder:text-text-tertiary focus-visible:border-accent/40"
          />
        </Label>
      ))}
    </div>
  );
}
