import { useEffect, useState } from "react";
import type { ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolChoices,
  profileToolLabel,
} from "../utils/available-tools";
import { ProfileColorPicker } from "./ProfileColorPicker";

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
        className="w-full max-w-sm rounded-xl border border-chrome-border-strong bg-chrome-surface-raised p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-chrome-text">Profile 設定</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-chrome-text-subtle">Profile 名稱</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="例如：work、side-project"
            className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] focus:border-chrome-border-hover focus:outline-none"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-chrome-text-subtle">Default directory</span>
          <p className="mb-1.5 text-[10px] text-chrome-text-dim">
            套用於新開啟的 terminal；已開啟的 pane 需關閉後重開才會換目錄。
          </p>
          <div className="flex gap-2">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Leave empty for home directory"
              className="min-w-0 flex-1 rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] focus:border-chrome-border-hover focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleBrowse()}
              disabled={busy}
              className="shrink-0 cursor-pointer rounded-md border border-chrome-border-strong px-3 py-2 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:opacity-40"
            >
              Browse
            </button>
          </div>
        </label>

        <fieldset className="mb-4">
          <legend className="mb-2 block text-[11px] text-chrome-text-subtle">標記色（淺色塊）</legend>
          <ProfileColorPicker
            value={accentColor}
            onChange={setAccentColor}
            disabled={busy}
          />
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-2 flex items-center gap-2 text-[11px] text-chrome-text-subtle">
            Default terminal tool
            {inventoryScanning && (
              <span className="text-[10px] text-chrome-text-dim">· detecting more…</span>
            )}
          </legend>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {tools.map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors ${
                  effectiveTool === t
                    ? "border-accent/50 bg-accent/15 text-chrome-accent-text"
                    : "border-chrome-border-subtle text-chrome-text-secondary hover:border-chrome-border-hover"
                }`}
              >
                <input
                  type="radio"
                  name={`defaultTool-${profile.id}`}
                  value={t}
                  checked={effectiveTool === t}
                  onChange={() => setTool(t)}
                  className="sr-only"
                />
                <ToolLogo tool={t} size={16} />
                <span className="text-[13px]">{profileToolLabel(t)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mb-5 flex cursor-pointer items-center gap-2 rounded-md border border-chrome-border-subtle px-3 py-2.5 text-[13px] text-chrome-text-secondary">
          <input
            type="checkbox"
            checked={broadcastInput}
            onChange={(e) => setBroadcastInput(e.target.checked)}
            disabled={busy}
            className="accent-accent"
          />
          同步輸入至所有 terminal
        </label>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete(profile)}
            className="cursor-pointer rounded-md px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            刪除 Profile
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-md px-4 py-2 text-[13px] text-chrome-text-muted hover:text-chrome-text disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="cursor-pointer rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-accent-hover disabled:opacity-40"
            >
              儲存
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
