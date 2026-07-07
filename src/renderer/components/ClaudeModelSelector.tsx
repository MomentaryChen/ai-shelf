import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  CLAUDE_MODEL_SHORT_PRESETS,
  claudeModelMatchesPreset,
  mergeClaudeModelOptions,
  type ClaudeModelShortPreset,
} from "../../shared/claude-tool-args.js";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  model: string;
  extraArgs: string;
  onModelChange: (model: string) => void;
  onExtraArgsChange: (extraArgs: string) => void;
  detectedModels?: string[];
  /** When set, empty model is treated as this preset (hides the CLI default chip). */
  implicitDefault?: string;
  /** Warm surface (flow) vs chrome (settings). */
  surface?: "warm" | "chrome";
  showExtraArgs?: boolean;
};

const PRESET_LABEL_KEYS = {
  opus: "claude.model.opus",
  sonnet: "claude.model.sonnet",
  haiku: "claude.model.haiku",
} as const;

export function ClaudeModelSelector({
  model,
  extraArgs,
  onModelChange,
  onExtraArgsChange,
  detectedModels,
  implicitDefault,
  surface = "warm",
  showExtraArgs = true,
}: Props) {
  const { t } = useLocale();
  const warm = surface === "warm";

  const modelOptions = useMemo(
    () => mergeClaudeModelOptions(detectedModels),
    [detectedModels],
  );
  const extendedModels = useMemo(
    () =>
      modelOptions.filter(
        (m) => !(CLAUDE_MODEL_SHORT_PRESETS as readonly string[]).includes(m),
      ),
    [modelOptions],
  );

  const effectiveModel = model.trim() || implicitDefault?.trim() || "";
  const presetActive = (preset: ClaudeModelShortPreset) =>
    claudeModelMatchesPreset(effectiveModel, preset);
  const isDefault = !implicitDefault && !model.trim();
  const shortPresetSelected = CLAUDE_MODEL_SHORT_PRESETS.some((p) => presetActive(p));
  const listSelected = extendedModels.includes(effectiveModel);
  const isCustom = !isDefault && !shortPresetSelected && !listSelected;
  const [customMode, setCustomMode] = useState(isCustom);

  useEffect(() => {
    if (isCustom) setCustomMode(true);
    if (isDefault || shortPresetSelected || listSelected) setCustomMode(false);
  }, [isCustom, isDefault, shortPresetSelected, listSelected]);

  const selectValue = listSelected ? effectiveModel : customMode || isCustom ? "__custom__" : "";

  const chipClass = (active: boolean) =>
    warm
      ? `cursor-pointer rounded-full px-3 py-1.5 text-[12px] transition-colors ${
          active
            ? "bg-[var(--clay)] text-white shadow-[var(--shadow-accent)]"
            : "bg-[var(--sand)] text-[var(--ink)] hover:bg-[var(--sand-deep)]"
        }`
      : `cursor-pointer rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
          active
            ? "border-accent/50 bg-accent/15 text-chrome-accent-text"
            : "border-chrome-border-subtle text-chrome-text-secondary hover:border-chrome-border-hover"
        }`;

  const fieldLabel = warm ? "text-[12px] text-[var(--muted)]" : "text-[11px] text-chrome-text-subtle";
  const inputClass = warm
    ? "rounded-[22px] border-[var(--sand)] bg-[var(--cream)] font-mono text-[13px]"
    : "min-w-0 flex-1 border-border bg-bg-secondary font-mono text-[12px] placeholder:text-text-tertiary focus-visible:border-accent/40";

  return (
    <div className="flex flex-col gap-2">
      <span className={fieldLabel}>{t("claude.model.label")}</span>

      <div className="flex flex-wrap gap-2">
        {!implicitDefault && (
          <button type="button" className={chipClass(isDefault)} onClick={() => onModelChange("")}>
            {t("claude.model.default")}
          </button>
        )}
        {CLAUDE_MODEL_SHORT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={chipClass(presetActive(preset))}
            onClick={() => {
              setCustomMode(false);
              onModelChange(preset === implicitDefault ? "" : preset);
            }}
          >
            {t(PRESET_LABEL_KEYS[preset])}
          </button>
        ))}
      </div>

      {extendedModels.length > 0 && (
        <select
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom__") {
              setCustomMode(true);
              onModelChange("");
              return;
            }
            setCustomMode(false);
            onModelChange(v);
          }}
          className={
            warm
              ? "rounded-[22px] border border-[var(--sand)] bg-[var(--cream)] px-3 py-2 font-mono text-[12px] text-[var(--ink)]"
              : "rounded-md border border-chrome-border-subtle bg-bg-secondary px-2 py-1.5 font-mono text-[12px]"
          }
        >
          <option value="">{t("claude.model.pickFromList")}</option>
          {extendedModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="__custom__">{t("claude.model.custom")}</option>
        </select>
      )}

      {(customMode || isCustom) && (
        <Input
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={t("claude.model.customPlaceholder")}
          spellCheck={false}
          className={inputClass}
        />
      )}

      {showExtraArgs && (
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t("claude.model.extraArgs")}</span>
          <Input
            value={extraArgs}
            onChange={(e) => onExtraArgsChange(e.target.value)}
            placeholder={t("claude.model.extraArgsPlaceholder")}
            spellCheck={false}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
