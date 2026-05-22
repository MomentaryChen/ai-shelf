import { useEffect, useState } from "react";
import type { ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolChoices,
  profileToolLabel,
} from "../utils/available-tools";
import { ProfileColorPicker } from "./ProfileColorPicker";
import { useLocale } from "../i18n/LocaleProvider";

export interface ProfileSettingsPatch {
  name: string;
  defaultCwd: string;
  defaultTool: string;
  broadcastInput: boolean;
  accentColor: string | null;
}

interface Props {
  open: boolean;
  profile: ProfileInfo | null;
  availableTools: string[];
  inventoryScanning?: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (profileId: string, patch: ProfileSettingsPatch) => void | Promise<void>;
  onDelete: (profile: ProfileInfo) => void | Promise<void>;
}

export function ProfileSettingsDialog({
  open,
  profile,
  availableTools,
  inventoryScanning = false,
  busy = false,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [tool, setTool] = useState(PLAIN_SHELL_TOOL_ID);
  const [broadcastInput, setBroadcastInput] = useState(false);
  const [accentColor, setAccentColor] = useState<string | null>(null);

  const tools = profileToolChoices(availableTools, profile?.defaultTool);

  useEffect(() => {
    if (!open || !profile) return;
    setName(profile.name);
    setCwd(profile.defaultCwd ?? "");
    setTool(profile.defaultTool || PLAIN_SHELL_TOOL_ID);
    setBroadcastInput(profile.broadcastInput ?? false);
    setAccentColor(profile.accentColor ?? null);
  }, [open, profile]);

  if (!open || !profile) return null;

  const effectiveTool = tools.includes(tool) ? tool : (tools[0] ?? PLAIN_SHELL_TOOL_ID);

  async function handleBrowse() {
    const picked = await window.api.pickFolder(cwd || undefined);
    if (picked) setCwd(picked);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    void onSave(profile!.id, {
      name: trimmedName,
      defaultCwd: cwd.trim(),
      defaultTool: effectiveTool,
      broadcastInput,
      accentColor,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        className="w-full max-w-sm rounded-xl border border-[#2a2a2a] bg-[#141414] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-[#f0f0f0]">{t("profile.dialog.settingsTitle")}</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-[#6b6b6b]">{t("profile.dialog.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t("profile.dialog.namePlaceholder")}
            className="w-full rounded-md border border-[#252525] bg-[#0a0a0a] px-3 py-2 text-[13px] focus:border-[#404040] focus:outline-none"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-[#6b6b6b]">{t("profile.dialog.defaultDir")}</span>
          <p className="mb-1.5 text-[10px] text-[#5a5a5a]">{t("profile.dialog.defaultDirHint")}</p>
          <div className="flex gap-2">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder={t("profile.dialog.cwdPlaceholder")}
              className="min-w-0 flex-1 rounded-md border border-[#252525] bg-[#0a0a0a] px-3 py-2 text-[13px] focus:border-[#404040] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleBrowse()}
              disabled={busy}
              className="shrink-0 cursor-pointer rounded-md border border-[#2a2a2a] px-3 py-2 text-[12px] text-[#a0a0a0] hover:border-[#404040] disabled:opacity-40"
            >
              {t("profile.dialog.browse")}
            </button>
          </div>
        </label>

        <fieldset className="mb-4">
          <legend className="mb-2 block text-[11px] text-[#6b6b6b]">{t("profile.dialog.accentLegend")}</legend>
          <ProfileColorPicker value={accentColor} onChange={setAccentColor} disabled={busy} />
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-2 flex items-center gap-2 text-[11px] text-[#6b6b6b]">
            {t("profile.dialog.defaultTool")}
            {inventoryScanning && (
              <span className="text-[10px] text-[#5a5a5a]">· {t("profile.dialog.detectingMore")}</span>
            )}
          </legend>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {tools.map((toolId) => (
              <label
                key={toolId}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors ${
                  effectiveTool === toolId
                    ? "border-[#3d5a80] bg-[#1a2a40]/50 text-[#8ab4ff]"
                    : "border-[#252525] text-[#a0a0a0] hover:border-[#353535]"
                }`}
              >
                <input
                  type="radio"
                  name={`defaultTool-${profile.id}`}
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

        <label className="mb-5 flex cursor-pointer items-center gap-2 rounded-md border border-[#252525] px-3 py-2.5 text-[13px] text-[#a0a0a0]">
          <input
            type="checkbox"
            checked={broadcastInput}
            onChange={(e) => setBroadcastInput(e.target.checked)}
            disabled={busy}
            className="accent-[#6b9fff]"
          />
          {t("profile.syncBroadcast")}
        </label>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete(profile)}
            className="cursor-pointer rounded-md px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            {t("profile.dialog.delete")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-md px-4 py-2 text-[13px] text-[#8a8a8a] hover:text-[#e0e0e0] disabled:opacity-40"
            >
              {t("profile.dialog.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="cursor-pointer rounded-md bg-[#2a4a7a] px-4 py-2 text-[13px] font-medium text-[#e8f0ff] hover:bg-[#355f9e] disabled:opacity-40"
            >
              {t("profile.dialog.save")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
