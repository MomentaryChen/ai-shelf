import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolChoices,
  profileToolLabel,
} from "../utils/available-tools";
import { ProfileColorPicker } from "./ProfileColorPicker";
import { useLocale } from "../i18n/LocaleProvider";
import {
  profileCreateDefaults,
  type ProfileStartFrom,
} from "../utils/profile-templates";

interface Props {
  open: boolean;
  profiles: ProfileInfo[];
  profileGroups: { id: string; name: string }[];
  defaultGroupId: string;
  availableTools: string[];
  inventoryScanning?: boolean;
  onClose: () => void;
  onCreate: (opts: {
    groupId: string;
    name: string;
    defaultCwd: string;
    defaultTool: string;
    accentColor: string | null;
    broadcastInput: boolean;
    copyFromProfileId?: string;
  }) => void;
  onQuickCreateGroup?: (name: string) => Promise<{ ok: boolean; groupId?: string; error?: string }>;
}

export function ProfileCreateDialog({
  open,
  profiles,
  profileGroups,
  defaultGroupId,
  availableTools,
  inventoryScanning = false,
  onClose,
  onCreate,
  onQuickCreateGroup,
}: Props) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [tool, setTool] = useState("");
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [broadcastInput, setBroadcastInput] = useState(false);
  const [startFrom, setStartFrom] = useState<ProfileStartFrom>("blank");
  const [copyFromProfileId, setCopyFromProfileId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [newGroupName, setNewGroupName] = useState("");
  const [quickCreatingGroup, setQuickCreatingGroup] = useState(false);
  const [groupErr, setGroupErr] = useState("");

  const tools = useMemo(
    () => profileToolChoices(availableTools),
    [availableTools],
  );
  const wasOpenRef = useRef(false);
  const startKeyRef = useRef("blank:");

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) return;

    if (justOpened) {
      setGroupId(defaultGroupId);
      setNewGroupName("");
      setGroupErr("");
      setStartFrom("blank");
      setCopyFromProfileId(null);
      startKeyRef.current = "blank:";
      const defaults = profileCreateDefaults("blank", profiles, null, tools);
      setName("");
      setCwd(defaults.defaultCwd);
      setAccentColor(defaults.accentColor);
      setBroadcastInput(defaults.broadcastInput);
      setTool(defaults.defaultTool);
      return;
    }

    const startKey = `${startFrom}:${copyFromProfileId ?? ""}`;
    if (startKey === startKeyRef.current) return;
    startKeyRef.current = startKey;

    const defaults = profileCreateDefaults(
      startFrom,
      profiles,
      copyFromProfileId,
      tools,
    );
    setCwd(defaults.defaultCwd);
    setTool(defaults.defaultTool);
    setAccentColor(defaults.accentColor);
    setBroadcastInput(defaults.broadcastInput);
    if (defaults.copyNameSource !== undefined) {
      setName(t("profile.dialog.copyNameDefault", { name: defaults.copyNameSource }));
    }
  }, [open, startFrom, copyFromProfileId, profiles, tools, t, defaultGroupId]);

  useEffect(() => {
    if (!open) return;
    setTool((prev) => {
      if (prev && tools.includes(prev)) return prev;
      return tools[0] ?? PLAIN_SHELL_TOOL_ID;
    });
  }, [open, tools]);

  if (!open) return null;

  const effectiveTool = tools.includes(tool) ? tool : (tools[0] ?? PLAIN_SHELL_TOOL_ID);
  const canCopy = profiles.length > 0;

  function handleStartFromChange(next: ProfileStartFrom) {
    setStartFrom(next);
    if (next === "copy" && !copyFromProfileId && profiles[0]) {
      setCopyFromProfileId(profiles[0].id);
    }
    if (next !== "copy") {
      setCopyFromProfileId(null);
      if (next === "blank") setName("");
    }
  }

  async function handleBrowse() {
    const picked = await window.api.pickFolder(cwd || undefined);
    if (picked) setCwd(picked);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !effectiveTool || !groupId) return;
    onCreate({
      groupId,
      name: trimmed,
      defaultCwd: cwd.trim(),
      defaultTool: effectiveTool,
      accentColor,
      broadcastInput,
      copyFromProfileId:
        startFrom === "copy" && copyFromProfileId ? copyFromProfileId : undefined,
    });
    setName("");
    setCwd("");
    setTool(tools[0] ?? PLAIN_SHELL_TOOL_ID);
    setAccentColor(null);
    setBroadcastInput(false);
    setStartFrom("blank");
    setCopyFromProfileId(null);
  }

  async function handleQuickCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed || !onQuickCreateGroup) return;
    setQuickCreatingGroup(true);
    setGroupErr("");
    const r = await onQuickCreateGroup(trimmed);
    setQuickCreatingGroup(false);
    if (!r.ok || !r.groupId) {
      setGroupErr(r.error ?? t("profileGroup.failedCreate"));
      return;
    }
    setGroupId(r.groupId);
    setNewGroupName("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border border-chrome-border-strong bg-chrome-surface-raised p-5 text-chrome-text shadow-float"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-chrome-text">{t("profile.dialog.createTitle")}</h2>

        <fieldset className="mb-4">
          <legend className="mb-2 block text-[11px] text-chrome-text-subtle">
            {t("profile.dialog.startFromLegend")}
          </legend>
          <select
            value={startFrom}
            onChange={(e) => handleStartFromChange(e.target.value as ProfileStartFrom)}
            className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text focus:border-chrome-border-hover focus:outline-none"
          >
            <option value="blank">{t("profile.dialog.startBlank")}</option>
            <option value="template-solo">{t("profile.dialog.templateSolo")}</option>
            <option value="template-multi">{t("profile.dialog.templateMulti")}</option>
            <option value="template-shell">{t("profile.dialog.templateShell")}</option>
            <option value="copy" disabled={!canCopy}>
              {t("profile.dialog.startCopy")}
            </option>
          </select>
          {startFrom === "copy" && canCopy && (
            <label className="mt-2 block">
              <span className="mb-1 block text-[10px] text-chrome-text-dim">
                {t("profile.dialog.copyFromProfile")}
              </span>
              <select
                value={copyFromProfileId ?? ""}
                onChange={(e) => setCopyFromProfileId(e.target.value || null)}
                className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text focus:border-chrome-border-hover focus:outline-none"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {startFrom !== "blank" && (
            <p className="mt-2 text-[10px] text-chrome-text-dim">
              {startFrom === "copy"
                ? t("profile.dialog.copyHint")
                : t("profile.dialog.templateHint")}
            </p>
          )}
        </fieldset>

        <label className="mb-3 block">
            <span className="mb-1 block text-[11px] text-chrome-text-subtle">
              {t("profile.dialog.group")}
            </span>
            {profileGroups.length > 0 ? (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text focus:border-chrome-border-hover focus:outline-none"
            >
              {profileGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            ) : (
              <p className="rounded-md border border-warn/35 bg-warn/10 px-3 py-2 text-[12px] text-warn">
                {t("profileGroup.emptyHint")}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t("profileGroup.quickCreatePlaceholder")}
                aria-label={t("profileGroup.quickCreatePlaceholder")}
                className="min-w-0 flex-1 rounded-md border border-chrome-border-subtle bg-chrome-bg px-3 py-2 text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus:border-chrome-border-hover focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleQuickCreateGroup();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void handleQuickCreateGroup()}
                disabled={quickCreatingGroup || !newGroupName.trim() || !onQuickCreateGroup}
                aria-label={t("profileGroup.create")}
                className="shrink-0 rounded-md border border-chrome-border-strong px-3 py-2 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:opacity-40"
              >
                {quickCreatingGroup ? t("profileGroup.creating") : t("profileGroup.create")}
              </button>
            </div>
            {groupErr && (
              <p className="mt-1 text-[11px] text-fail">{groupErr}</p>
            )}
          </label>

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

        <fieldset className="mb-4">
          <legend className="mb-2 flex items-center gap-2 text-[11px] text-chrome-text-subtle">
            {t("profile.dialog.defaultTool")}
            {inventoryScanning && tools.length > 0 && (
              <span className="text-[10px] text-chrome-text-dim">· {t("profile.dialog.detectingMore")}</span>
            )}
          </legend>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
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

        <label className="mb-5 flex cursor-pointer items-center gap-2 rounded-md border border-chrome-border-subtle px-3 py-2.5 text-[13px] text-chrome-text-secondary">
          <input
            type="checkbox"
            checked={broadcastInput}
            onChange={(e) => setBroadcastInput(e.target.checked)}
            className="accent-accent"
          />
          {t("profile.syncBroadcast")}
        </label>

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
            disabled={!name.trim() || !groupId}
            className="cursor-pointer rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-accent-hover disabled:opacity-40"
          >
            {t("profile.dialog.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
