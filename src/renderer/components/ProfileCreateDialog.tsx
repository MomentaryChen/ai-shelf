import { useEffect, useState } from "react";
import { ToolLogo } from "./ToolLogo";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolChoices,
  profileToolLabel,
} from "../utils/available-tools";
import { ProfileColorPicker } from "./ProfileColorPicker";

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
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [tool, setTool] = useState("");
  const [accentColor, setAccentColor] = useState<string | null>(null);

  const tools = profileToolChoices(availableTools);

  useEffect(() => {
    if (!open) return;
    setAccentColor(null);
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
        className="w-full max-w-sm rounded-xl border border-chrome-border-strong bg-chrome-surface-raised p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-chrome-text">New Profile</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-chrome-text-subtle">Profile name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Work, Side project"
            className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] focus:border-chrome-border-hover focus:outline-none"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-chrome-text-subtle">Default directory</span>
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
              className="shrink-0 cursor-pointer rounded-md border border-chrome-border-strong px-3 py-2 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover"
            >
              Browse
            </button>
          </div>
        </label>

        <fieldset className="mb-4">
          <legend className="mb-2 block text-[11px] text-chrome-text-subtle">標記色（淺色塊）</legend>
          <p className="mb-2 text-[10px] text-chrome-text-dim">未選擇時會自動分配下一個可用色</p>
          <ProfileColorPicker value={accentColor} onChange={setAccentColor} />
        </fieldset>

        <fieldset className="mb-5">
          <legend className="mb-2 flex items-center gap-2 text-[11px] text-chrome-text-subtle">
            Default terminal tool
            {inventoryScanning && tools.length > 0 && (
              <span className="text-[10px] text-chrome-text-dim">· detecting more…</span>
            )}
          </legend>
          <div className="flex flex-col gap-1">
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
                    name="defaultTool"
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

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-4 py-2 text-[13px] text-chrome-text-muted hover:text-chrome-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="cursor-pointer rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-accent-hover disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
