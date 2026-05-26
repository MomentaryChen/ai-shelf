import { useEffect, useMemo, useRef, useState } from "react";
import { ToolLogo } from "./ToolLogo";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolChoices,
  profileToolLabel,
} from "../utils/available-tools";
import { ProfileColorPicker } from "./ProfileColorPicker";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  open: boolean;
  availableTools: string[];
  inventoryScanning?: boolean;
  onClose: () => void;
  onCreate: (opts: {
    name: string;
    defaultCwd: string;
    defaultTool: string;
    accentColor: string | null;
  }) => void;
}

export function ProfileCreateDialog({
  open,
  availableTools,
  inventoryScanning = false,
  onClose,
  onCreate,
}: Props) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [tool, setTool] = useState("");
  const [accentColor, setAccentColor] = useState<string | null>(null);

  const tools = useMemo(
    () => profileToolChoices(availableTools),
    [availableTools],
  );
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) return;
    if (justOpened) {
      setName("");
      setCwd("");
      setAccentColor(null);
    }
    setTool((prev) => {
      if (prev && tools.includes(prev)) return prev;
      return tools[0] ?? PLAIN_SHELL_TOOL_ID;
    });
  }, [open, tools]);

  if (!open) return null;

  const effectiveTool = tools.includes(tool) ? tool : (tools[0] ?? PLAIN_SHELL_TOOL_ID);

  async function handleBrowse() {
    const picked = await window.api.pickFolder(cwd || undefined);
    if (picked) setCwd(picked);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !effectiveTool) return;
    onCreate({
      name: trimmed,
      defaultCwd: cwd.trim(),
      defaultTool: effectiveTool,
      accentColor,
    });
    setName("");
    setCwd("");
    setTool(tools[0] ?? PLAIN_SHELL_TOOL_ID);
    setAccentColor(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        className="w-full max-w-sm rounded-xl border border-chrome-border-strong bg-chrome-surface-raised p-5 text-chrome-text shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-chrome-text">{t("profile.dialog.createTitle")}</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-chrome-text-subtle">{t("profile.dialog.name")}</span>

          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profile.dialog.namePlaceholder")}
            className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus:border-chrome-border-hover focus:outline-none"

          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-chrome-text-subtle">{t("profile.dialog.defaultDir")}</span>

          <div className="flex gap-2">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder={t("profile.dialog.cwdPlaceholder")}
              className="min-w-0 flex-1 rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus:border-chrome-border-hover focus:outline-none"

            />
            <button
              type="button"
              onClick={() => void handleBrowse()}
              className="shrink-0 cursor-pointer rounded-md border border-chrome-border-strong px-3 py-2 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover"
            >
              {t("profile.dialog.browse")}
            </button>
          </div>
        </label>

        <fieldset className="mb-4">
          <legend className="mb-2 block text-[11px] text-chrome-text-subtle">{t("profile.dialog.accentLegend")}</legend>
          <p className="mb-2 text-[10px] text-chrome-text-dim">{t("profile.dialog.accentAuto")}</p>

          <ProfileColorPicker value={accentColor} onChange={setAccentColor} />
        </fieldset>

        <fieldset className="mb-5">
          <legend className="mb-2 flex items-center gap-2 text-[11px] text-chrome-text-subtle">
            {t("profile.dialog.defaultTool")}
            {inventoryScanning && tools.length > 0 && (
              <span className="text-[10px] text-chrome-text-dim">· {t("profile.dialog.detectingMore")}</span>
            )}
          </legend>
          <div className="flex flex-col gap-1">
            {tools.map((toolId) => (
              <label
                key={toolId}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors ${
                  effectiveTool === toolId
                    ? "border-accent/50 bg-accent/15 text-chrome-accent-text"
                    : "border-chrome-border-subtle text-chrome-text-secondary hover:border-chrome-border-hover"
                }`}
              >
                <input
                  type="radio"
                  name="defaultTool"
                  value={toolId}
                  checked={effectiveTool === toolId}
                  onChange={() => setTool(toolId)}
                  className="sr-only"
                />
                <ToolLogo tool={toolId} size={16} />
                <span className="text-[13px]">{profileToolLabel(toolId)}</span>
              </label>
            ))}

          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-4 py-2 text-[13px] text-chrome-text-muted hover:text-chrome-text"
          >
            {t("profile.dialog.cancel")}
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="cursor-pointer rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-accent-hover disabled:opacity-40"
          >
            {t("profile.dialog.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
