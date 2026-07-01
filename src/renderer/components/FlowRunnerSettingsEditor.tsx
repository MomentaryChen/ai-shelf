import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildToolArgsWithClaudeModel,
  parseClaudeModelFromToolArgs,
} from "../../shared/claude-tool-args.js";
import { flowAgentSupportsMcp, flowRunnerPickerToolIds } from "../../shared/flow-runner-tools.js";
import type { FlowDefinition } from "../../shared/flow-types.js";
import { resolveToolLaunchExtraArgs } from "../../tool-launch.js";
import { canonicalToolId } from "../../tools.js";
import { loadSettings, SETTINGS_CHANGE_EVENT } from "../chat-settings";
import type { ProfileInfo } from "../types";
import { useLocale } from "../i18n/LocaleProvider";
import {
  isPlainShellTool,
  profileToolLabel,
} from "../utils/available-tools";
import { ClaudeModelSelector } from "./ClaudeModelSelector";
import { ToolLogo } from "./ToolLogo";

type Props = {
  flowId: string;
  flowDef: FlowDefinition;
  claudeModels?: string[];
  cursorModels?: string[];
  profiles: ProfileInfo[];
  onSaved: () => void;
  embedded?: boolean;
  /** Pin save action below a scrollable form (dialog use). */
  stickyFooter?: boolean;
};

export function FlowRunnerSettingsEditor({
  flowId,
  flowDef,
  claudeModels,
  cursorModels,
  profiles,
  onSaved,
  embedded = false,
  stickyFooter = false,
}: Props) {
  const { t } = useLocale();
  const [tool, setTool] = useState(flowDef.agentTool || "claude");
  const parsedArgs = useMemo(
    () => parseClaudeModelFromToolArgs(flowDef.toolArgs ?? ""),
    [flowDef.toolArgs],
  );
  const [claudeModel, setClaudeModel] = useState(parsedArgs.model);
  const [extraToolArgs, setExtraToolArgs] = useState(parsedArgs.extraArgs);
  const [toolArgs, setToolArgs] = useState(flowDef.toolArgs ?? "");
  const [cwd, setCwd] = useState(flowDef.cwd ?? "");
  const [profileId, setProfileId] = useState(flowDef.profileId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalToolLaunchArgs, setGlobalToolLaunchArgs] = useState(() => loadSettings().toolLaunchArgs);
  const argsByToolRef = useRef<Record<string, string>>({});

  const canonicalTool = canonicalToolId(tool);
  const toolSupported = flowAgentSupportsMcp(canonicalTool);
  const showModelPicker = toolSupported;
  const detectedModels = canonicalTool === "cursor" ? cursorModels : claudeModels;

  const tools = useMemo(
    () =>
      flowRunnerPickerToolIds(
        flowAgentSupportsMcp(flowDef.agentTool) ? flowDef.agentTool : undefined,
      ),
    [flowDef.agentTool],
  );

  const applyArgsToForm = useCallback((args: string, forTool: string) => {
    const supported = flowAgentSupportsMcp(canonicalToolId(forTool));
    if (supported) {
      const parsed = parseClaudeModelFromToolArgs(args);
      setClaudeModel(parsed.model);
      setExtraToolArgs(parsed.extraArgs);
    } else {
      setToolArgs(args);
    }
  }, []);

  const resolveArgsForTool = useCallback(
    (toolId: string, drafts: Record<string, string>): string => {
      const draft = drafts[toolId]?.trim();
      if (draft) return draft;

      const savedTool = flowDef.agentTool || "claude";
      if (
        canonicalToolId(toolId) === canonicalToolId(savedTool) &&
        flowDef.toolArgs?.trim()
      ) {
        return flowDef.toolArgs.trim();
      }

      return resolveToolLaunchExtraArgs(globalToolLaunchArgs, toolId) ?? "";
    },
    [flowDef.agentTool, flowDef.toolArgs, globalToolLaunchArgs],
  );

  const resolvedToolArgs = useMemo(() => {
    if (showModelPicker) return buildToolArgsWithClaudeModel(claudeModel, extraToolArgs);
    return toolArgs;
  }, [showModelPicker, claudeModel, extraToolArgs, toolArgs]);

  const switchTool = useCallback(
    (nextTool: string) => {
      if (nextTool === tool) return;
      const currentArgs = showModelPicker
        ? buildToolArgsWithClaudeModel(claudeModel, extraToolArgs)
        : toolArgs;
      argsByToolRef.current = { ...argsByToolRef.current, [tool]: currentArgs };
      setTool(nextTool);
      applyArgsToForm(resolveArgsForTool(nextTool, argsByToolRef.current), nextTool);
    },
    [
      tool,
      showModelPicker,
      claudeModel,
      extraToolArgs,
      toolArgs,
      resolveArgsForTool,
      applyArgsToForm,
    ],
  );

  useEffect(() => {
    const onSettingsChange = () => setGlobalToolLaunchArgs(loadSettings().toolLaunchArgs);
    window.addEventListener(SETTINGS_CHANGE_EVENT, onSettingsChange);
    return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, onSettingsChange);
  }, []);

  useEffect(() => {
    argsByToolRef.current = {};
    const savedTool = flowDef.agentTool || "claude";
    const initialTool = flowAgentSupportsMcp(savedTool) ? savedTool : "claude";
    setTool(initialTool);
    setCwd(flowDef.cwd ?? "");
    setProfileId(flowDef.profileId ?? "");
    setError(null);

    const initialArgs = resolveArgsForTool(initialTool, {});
    applyArgsToForm(initialArgs, initialTool);
    if (flowDef.toolArgs?.trim()) {
      argsByToolRef.current[initialTool] = flowDef.toolArgs.trim();
    }
  }, [flowId, flowDef, resolveArgsForTool, applyArgsToForm]);

  const dirty = useMemo(() => {
    const baseTool = flowDef.agentTool || "claude";
    return (
      tool !== baseTool ||
      resolvedToolArgs.trim() !== (flowDef.toolArgs ?? "").trim() ||
      cwd.trim() !== (flowDef.cwd ?? "").trim() ||
      profileId.trim() !== (flowDef.profileId ?? "").trim()
    );
  }, [tool, resolvedToolArgs, cwd, profileId, flowDef]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await window.api.flowSaveRunnerSettings(flowId, {
      tool: tool.trim() || "claude",
      toolArgs: resolvedToolArgs.trim() || null,
      cwd: cwd.trim() || null,
      profile: profileId.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? t("flow.runner.saveFailed"));
      return;
    }
    onSaved();
  };

  const browseCwd = async () => {
    const picked = await window.api.pickFolder(cwd.trim() || undefined);
    if (picked) setCwd(picked);
  };

  if (flowDef.runner !== "claude") {
    return (
      <p className="py-4 text-[13px] text-text-secondary">{t("flow.runner.httpOnly")}</p>
    );
  }

  const formFields = (
    <>
      {!embedded && (
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">{t("flow.runner.title")}</h2>
          <p className="mt-1 text-[13px] text-text-secondary">{t("flow.runner.hint")}</p>
        </div>
      )}

      <fieldset className="mt-4 rounded-[22px] border border-border bg-bg-primary/50 p-3">
        <legend className="mb-2 px-1 text-[12px] text-text-secondary">{t("flow.runner.tool")}</legend>
        <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
          {tools.map((toolId) => (
            <label
              key={toolId}
              className={`flex cursor-pointer items-center gap-2 rounded-[18px] border px-3 py-2 transition-colors ${
                tool === toolId
                  ? "border-accent/50 bg-bg-secondary shadow-[0_0_0_2px_rgba(201,123,90,0.2)]"
                  : "border-transparent hover:bg-bg-card/60"
              }`}
            >
              <input
                type="radio"
                name={`flow-tool-${flowId}`}
                value={toolId}
                checked={tool === toolId}
                onChange={() => switchTool(toolId)}
                className="sr-only"
              />
              <ToolLogo tool={toolId} size={16} />
              <span className="text-[13px] text-text-primary">{profileToolLabel(toolId)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 rounded-[22px] border border-border bg-bg-primary/50 p-3">
          <ClaudeModelSelector
            model={claudeModel}
            extraArgs={extraToolArgs}
            onModelChange={setClaudeModel}
            onExtraArgsChange={setExtraToolArgs}
            detectedModels={detectedModels}
            surface="warm"
          />
          <p className="mt-2 text-[11px] text-text-secondary">{t("flow.runner.toolArgsHint")}</p>
        </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[12px] text-text-secondary">{t("flow.runner.profile")}</label>
        <select
          value={profileId}
          onChange={(e) => {
            const nextId = e.target.value;
            setProfileId(nextId);
            const profile = profiles.find((p) => p.id === nextId);
            if (!profile) return;
            if (!cwd.trim() && profile.defaultCwd?.trim()) {
              setCwd(profile.defaultCwd.trim());
            }
            if (profile.defaultTool && !isPlainShellTool(profile.defaultTool)) {
              const pick =
                canonicalToolId(profile.defaultTool) === "cursor" ? "agent" : profile.defaultTool;
              if (flowAgentSupportsMcp(pick) && tools.includes(pick)) switchTool(pick);
            }
          }}
          className="rounded-[22px] border border-border bg-bg-primary px-3 py-2 text-[13px] text-text-primary"
        >
          <option value="">{t("flow.runner.profileNone")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-text-secondary">{t("flow.runner.profileHint")}</p>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[12px] text-text-secondary">{t("flow.runner.cwd")}</label>
        <div className="flex gap-2">
          <Input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="~/projects/my-app"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-[22px] border-border bg-bg-primary font-mono text-[13px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void browseCwd()}
            className="shrink-0 rounded-[22px] border-border"
          >
            {t("profile.dialog.browse")}
          </Button>
        </div>
      </div>
    </>
  );

  const saveFooter = (
    <>
      {error && (
        <p className="rounded-[20px] border border-fail/30 bg-fail/10 px-3 py-2 text-[12px] text-fail">
          {error}
        </p>
      )}
      <div className={`flex justify-end ${stickyFooter ? "" : "mt-4"}`}>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-[22px]"
        >
          {saving ? t("flow.runner.saving") : t("flow.runner.save")}
        </Button>
      </div>
    </>
  );

  if (stickyFooter) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">{formFields}</div>
        <div className="mt-3 shrink-0 space-y-2 border-t border-border pt-3">{saveFooter}</div>
      </div>
    );
  }

  const body = (
    <>
      {formFields}
      {error && (
        <p className="mt-3 rounded-[20px] border border-fail/30 bg-fail/10 px-3 py-2 text-[12px] text-fail">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-[22px]"
        >
          {saving ? t("flow.runner.saving") : t("flow.runner.save")}
        </Button>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <section className="rounded-[28px] bg-bg-secondary p-5 shadow-card">{body}</section>
  );
}
