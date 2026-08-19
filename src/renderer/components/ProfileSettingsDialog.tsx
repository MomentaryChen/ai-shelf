import { useEffect, useState } from "react";
import type { ProfileInfo, SavedCommandSnippet } from "../types";
import { ToolLogo } from "./ToolLogo";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolChoices,
  profileToolLabel,
} from "../utils/available-tools";
import { ProfileColorPicker } from "./ProfileColorPicker";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SavedCommandsEditor } from "./SavedCommandsEditor";

export interface ProfileSettingsPatch {
  name: string;
  defaultCwd: string;
  defaultTool: string;
  broadcastInput: boolean;
  accentColor: string | null;
  savedCommands: SavedCommandSnippet[];
  groupId: string;
}

interface Props {
  open: boolean;
  profile: ProfileInfo | null;
  profileGroups: { id: string; name: string }[];
  availableTools: string[];
  inventoryScanning?: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (profileId: string, patch: ProfileSettingsPatch) => string | void | Promise<string | void>;
  onDelete: (profile: ProfileInfo) => void | Promise<void>;
}

export function ProfileSettingsDialog({
  open,
  profile,
  profileGroups,
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
  const [savedCommands, setSavedCommands] = useState<SavedCommandSnippet[]>([]);
  const [groupId, setGroupId] = useState("");
  const [saveError, setSaveError] = useState("");

  const tools = profileToolChoices(availableTools, profile?.defaultTool);

  useEffect(() => {
    if (!open || !profile) return;
    setName(profile.name);
    setCwd(profile.defaultCwd ?? "");
    setTool(profile.defaultTool || PLAIN_SHELL_TOOL_ID);
    setBroadcastInput(profile.broadcastInput ?? false);
    setAccentColor(profile.accentColor ?? null);
    setSavedCommands(profile.savedCommands ?? []);
    setGroupId(profile.workspaceId);
    setSaveError("");
  }, [open, profile]);

  if (!profile) return null;

  const effectiveTool = tools.includes(tool) ? tool : (tools[0] ?? PLAIN_SHELL_TOOL_ID);

  async function handleBrowse() {
    const picked = await window.api.pickFolder(cwd || undefined);
    if (picked) setCwd(picked);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaveError("");
    const error = await onSave(profile!.id, {
      name: trimmedName,
      defaultCwd: cwd.trim(),
      defaultTool: effectiveTool,
      broadcastInput,
      accentColor,
      groupId: groupId || profile!.workspaceId,
      savedCommands: savedCommands
        .map((s) => ({
          ...s,
          name: s.name.trim(),
          command: s.command.trim(),
        }))
        .filter((s) => s.name && s.command),
    });
    if (error) setSaveError(error);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm max-h-[min(90vh,720px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("profile.dialog.settingsTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
        <Label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
            {t("profile.dialog.name")}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t("profile.dialog.namePlaceholder")}
            className="border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover"
          />
        </Label>

        <Label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
            {t("profile.dialog.group")}
          </span>
          <p className="mb-1.5 text-[10px] font-normal text-chrome-text-dim">
            {t("profile.dialog.groupHint")}
          </p>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={busy || profileGroups.length === 0}
            className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text focus:border-chrome-border-hover focus:outline-none disabled:opacity-40"
          >
            {profileGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Label>

        <Label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
            {t("profile.dialog.defaultDir")}
          </span>
          <p className="mb-1.5 text-[10px] font-normal text-chrome-text-dim">
            {t("profile.dialog.defaultDirHint")}
          </p>
          <div className="flex gap-2">
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder={t("profile.dialog.cwdPlaceholder")}
              className="min-w-0 flex-1 border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover"
            />
            <button
              type="button"
              onClick={() => void handleBrowse()}
              disabled={busy}
              className="shrink-0 cursor-pointer rounded-md border border-chrome-border-strong px-3 py-2 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:opacity-40"
            >
              {t("profile.dialog.browse")}
            </button>
          </div>
        </Label>

        <fieldset className="mb-4">
          <legend className="mb-2 block text-[11px] text-chrome-text-subtle">{t("profile.dialog.accentLegend")}</legend>
          <ProfileColorPicker value={accentColor} onChange={setAccentColor} disabled={busy} />
        </fieldset>

        <fieldset className="mb-4 rounded-lg border border-chrome-border-subtle bg-chrome-surface/40 p-3">
          <legend className="mb-2 flex items-center gap-2 text-[11px] text-chrome-text-subtle">
            {t("profile.dialog.defaultTool")}
            {inventoryScanning && (
              <span className="text-[10px] text-chrome-text-dim">· {t("profile.dialog.detectingMore")}</span>

            )}
          </legend>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
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

        <Label className="mb-5 flex cursor-pointer items-center gap-2 rounded-md border border-chrome-border-subtle px-3 py-2.5 text-[13px] font-normal text-chrome-text-secondary">
          <Checkbox
            checked={broadcastInput}
            onCheckedChange={(v) => setBroadcastInput(v === true)}
            disabled={busy}
          />
          {t("profile.syncBroadcast")}
        </Label>

        <SavedCommandsEditor value={savedCommands} onChange={setSavedCommands} disabled={busy} />

        {saveError ? <p className="mb-3 text-[12px] text-fail">{saveError}</p> : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void onDelete(profile)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {t("profile.dialog.delete")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              {t("profile.dialog.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {t("profile.dialog.save")}
            </Button>
          </div>
        </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
