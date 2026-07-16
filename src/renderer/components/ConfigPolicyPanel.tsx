import { useCallback, useEffect, useState } from "react";
import type { PolicyViolation, TeamPolicy } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "@/components/ui/button";
import { MCP_SYNC_TOOL_IDS, SKILL_SYNC_TOOL_IDS } from "../../tools.js";
import { useLocale } from "../i18n/LocaleProvider";

function listToText(names?: string[]): string {
  return (names ?? []).join("\n");
}

function textToList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function emptyDraft(): TeamPolicy {
  return { version: 1 };
}

export function ConfigPolicyPanel() {
  const { t } = useLocale();
  const [draft, setDraft] = useState<TeamPolicy>(emptyDraft);
  const [path, setPath] = useState("");
  const [violations, setViolations] = useState<PolicyViolation[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus(null);
    try {
      const evaluated = await window.api.evaluateTeamPolicy();
      setDraft(evaluated.policy);
      setPath(evaluated.path);
      setViolations(evaluated.violations);
    } catch (err) {
      console.error("[ConfigPolicyPanel] load error:", err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await window.api.setTeamPolicy(draft);
      if (!res.ok) {
        setStatus(res.error ?? t("inventory.policy.saveFailed"));
        return;
      }
      setDraft(res.policy);
      setPath(res.path);
      const evaluated = await window.api.evaluateTeamPolicy();
      setViolations(evaluated.violations);
      setStatus(t("inventory.policy.saved"));
    } catch {
      setStatus(t("inventory.policy.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const importPolicy = async () => {
    const res = await window.api.importTeamPolicy();
    if (res.canceled) return;
    if (!res.ok) {
      setStatus(res.error ?? t("inventory.policy.importFailed"));
      return;
    }
    setDraft(res.policy);
    setPath(res.path);
    await load();
    setStatus(t("inventory.policy.imported"));
  };

  const exportPolicy = async () => {
    const res = await window.api.exportTeamPolicy();
    if (res.canceled) return;
    setStatus(res.ok ? t("inventory.policy.exported") : res.error ?? t("inventory.policy.exportFailed"));
  };

  const violationLabel = (v: PolicyViolation): string => {
    switch (v.kind) {
      case "mcp-forbidden":
        return t("inventory.policy.vMcpForbidden", { name: v.name, tool: v.tool });
      case "mcp-required":
        return t("inventory.policy.vMcpRequired", { name: v.name, tool: v.tool });
      case "skill-forbidden":
        return t("inventory.policy.vSkillForbidden", { name: v.name, tool: v.tool });
      case "skill-required":
        return t("inventory.policy.vSkillRequired", { name: v.name, tool: v.tool });
    }
  };

  return (
    <Card className="mb-5" title={`📋 ${t("inventory.policy.title")}`}>
      <p className="mb-3 text-[13px] text-text-secondary">{t("inventory.policy.subtitle")}</p>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.name")}</span>
          <input
            type="text"
            value={draft.name ?? ""}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value || undefined }))}
            placeholder={t("inventory.policy.namePlaceholder")}
            className="rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.path")}</span>
          <button
            type="button"
            title={path}
            onClick={() => path && void window.api.openPath(path)}
            className="truncate rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-left font-mono text-[11px] text-text-primary hover:border-accent"
          >
            {path || "…"}
          </button>
        </label>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.mcpSource")}</span>
          <select
            value={draft.sourceOfTruth?.mcp ?? ""}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                sourceOfTruth: {
                  ...p.sourceOfTruth,
                  mcp: e.target.value || undefined,
                },
              }))
            }
            className="rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <option value="">{t("inventory.policy.defaultClaude")}</option>
            {MCP_SYNC_TOOL_IDS.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.skillsSource")}</span>
          <select
            value={draft.sourceOfTruth?.skills ?? ""}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                sourceOfTruth: {
                  ...p.sourceOfTruth,
                  skills: e.target.value || undefined,
                },
              }))
            }
            className="rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <option value="">{t("inventory.policy.defaultClaude")}</option>
            {SKILL_SYNC_TOOL_IDS.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.mcpForbidden")}</span>
          <textarea
            value={listToText(draft.mcp?.forbidden)}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                mcp: { ...p.mcp, forbidden: textToList(e.target.value) },
              }))
            }
            rows={3}
            placeholder={t("inventory.policy.listPlaceholder")}
            className="resize-y rounded-md border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-[12px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.mcpRequired")}</span>
          <textarea
            value={listToText(draft.mcp?.required)}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                mcp: { ...p.mcp, required: textToList(e.target.value) },
              }))
            }
            rows={3}
            placeholder={t("inventory.policy.listPlaceholder")}
            className="resize-y rounded-md border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-[12px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.skillForbidden")}</span>
          <textarea
            value={listToText(draft.skills?.forbidden)}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                skills: { ...p.skills, forbidden: textToList(e.target.value) },
              }))
            }
            rows={3}
            placeholder={t("inventory.policy.listPlaceholder")}
            className="resize-y rounded-md border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-[12px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span className="font-medium">{t("inventory.policy.skillRequired")}</span>
          <textarea
            value={listToText(draft.skills?.required)}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                skills: { ...p.skills, required: textToList(e.target.value) },
              }))
            }
            rows={3}
            placeholder={t("inventory.policy.listPlaceholder")}
            className="resize-y rounded-md border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-[12px] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? t("inventory.policy.saving") : t("inventory.policy.save")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void importPolicy()}>
          {t("inventory.policy.import")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void exportPolicy()}>
          {t("inventory.policy.export")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          {t("inventory.policy.recheck")}
        </Button>
      </div>

      {status && <p className="mb-3 text-xs text-text-secondary">{status}</p>}

      <div className="rounded-lg border border-border bg-bg-primary px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("inventory.policy.violations")}
          </p>
          {violations.length === 0 ? (
            <Badge text={t("inventory.policy.noViolations")} variant="ok" />
          ) : (
            <Badge text={String(violations.length)} variant="warn" />
          )}
        </div>
        {violations.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t("inventory.policy.noViolationsHint")}</p>
        ) : (
          <ul className="space-y-1 text-xs text-text-primary">
            {violations.map((v) => (
              <li key={`${v.kind}:${v.tool}:${v.name}`}>• {violationLabel(v)}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
