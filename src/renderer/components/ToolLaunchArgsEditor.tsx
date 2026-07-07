import { useEffect, useState } from "react";
import { INVENTORY_TOOL_IDS } from "../../tools.js";
import {
  buildToolArgsWithClaudeModel,
  parseClaudeModelFromToolArgs,
} from "../../shared/claude-tool-args.js";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ToolLaunchArgs } from "../chat-settings";
import { useLocale } from "../i18n/LocaleProvider";
import { profileToolLabel } from "../utils/available-tools";
import { ClaudeModelSelector } from "./ClaudeModelSelector";
import { ToolLogo } from "./ToolLogo";

interface Props {
  compact?: boolean;
  args: ToolLaunchArgs;
  onChange: (args: ToolLaunchArgs) => void;
}

export function ToolLaunchArgsEditor({ compact = false, args, onChange }: Props) {
  const { t } = useLocale();
  const [claudeModels, setClaudeModels] = useState<string[]>([]);
  const [cursorModels, setCursorModels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.api
      .getInventory()
      .then((inventory) => {
        if (cancelled) return;
        const claude = inventory.find((e) => e.tool === "claude");
        if (claude?.models?.length) setClaudeModels(claude.models);
        const cursor = inventory.find((e) => e.tool === "agent" || e.tool === "cursor");
        if (cursor?.models?.length) setCursorModels(cursor.models);
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setToolArg(tool: string, value: string) {
    const trimmed = value.trim();
    const next = { ...args };
    if (trimmed) next[tool] = trimmed;
    else delete next[tool];
    onChange(next);
  }

  function setModelArgs(tool: string, model: string, extraArgs: string) {
    setToolArg(tool, buildToolArgsWithClaudeModel(model, extraArgs));
  }

  return (
    <div className={compact ? "flex max-h-[min(52vh,480px)] flex-col gap-2 overflow-y-auto overscroll-y-contain pr-1" : "flex max-h-[min(60vh,560px)] flex-col gap-2.5 overflow-y-auto overscroll-y-contain pr-1"}>
      {INVENTORY_TOOL_IDS.map((tool) => {
        if (tool === "claude" || tool === "cursor") {
          const parsed = parseClaudeModelFromToolArgs(args[tool] ?? "");
          const detectedModels = tool === "cursor" ? cursorModels : claudeModels;
          return (
            <div
              key={tool}
              className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5"
            >
              <span className="flex items-center gap-2 text-[13px] text-text-primary">
                <ToolLogo tool={tool} size={16} />
                {profileToolLabel(tool)}
              </span>
              <ClaudeModelSelector
                model={parsed.model}
                extraArgs={parsed.extraArgs}
                onModelChange={(model) => setModelArgs(tool, model, parsed.extraArgs)}
                onExtraArgsChange={(extraArgs) => setModelArgs(tool, parsed.model, extraArgs)}
                detectedModels={detectedModels}
                surface="chrome"
              />
            </div>
          );
        }

        return (
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
        );
      })}
    </div>
  );
}
