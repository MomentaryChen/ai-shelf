import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, XCircle, Zap } from "lucide-react";
import type { SkillSyncResult, SkillsRawData } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "@/components/ui/button";
import { SKILL_SYNC_TOOL_IDS } from "../../tools.js";
import { ToolLogo } from "./ToolLogo";
import { useLocale } from "../i18n/LocaleProvider";

const TOOLS = SKILL_SYNC_TOOL_IDS;
const toolMark = (tool: string) => <ToolLogo tool={tool} size={14} />;

export function SkillsSyncPanel() {
  const { t } = useLocale();
  const [rawData, setRawData] = useState<SkillsRawData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTools, setTargetTools] = useState<Set<string>>(new Set(TOOLS));
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SkillSyncResult[] | null>(null);

  const load = useCallback(async () => {
    setResults(null);
    try {
      const data = await window.api.getSkillsRaw();
      setRawData(data);
    } catch (err) {
      console.error("[SkillsSyncPanel] load error:", err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rawData) return null;

  const allSkillNames = [
    ...new Set(TOOLS.flatMap((tool) => Object.keys(rawData[tool]?.skills ?? {}))),
  ].sort();

  const syncableSkills = allSkillNames.filter((name) =>
    TOOLS.some((tool) => !rawData[tool]?.skills?.[name]),
  );
  const syncedCount = allSkillNames.length - syncableSkills.length;
  const allMissingSelected = syncableSkills.length > 0 && selected.size === syncableSkills.length;

  const toggleSkill = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleTarget = (tool: string) =>
    setTargetTools((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });

  const doSync = async (skillNames: string[]) => {
    if (skillNames.length === 0 || targetTools.size === 0) return;
    setSyncing(true);
    setResults(null);
    try {
      const res = await window.api.syncSkills({ skillNames, targetTools: [...targetTools] });
      setResults(res);
      await load();
      await window.api.startInventoryScan();
    } catch {
      setResults([{ tool: "all", added: [], skipped: [], error: "Sync failed" }]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      className="mb-5"
      title={
        <>
          <Zap aria-hidden className="h-4 w-4 text-accent" />
          {t("inventory.skillsSync.title")}
        </>
      }
    >
      {results && (
        <div className="mb-4 rounded-lg border border-border bg-bg-primary p-3">
          {results.map((r) => (
            <div key={r.tool} className="mb-1 text-sm">
              <strong className="inline-flex items-center gap-1.5">
                {toolMark(r.tool)} {r.tool}
              </strong>
              :{" "}
              {r.error ? (
                <span className="inline-flex items-center gap-1 text-fail">
                  <XCircle aria-hidden className="h-3.5 w-3.5" /> {r.error}
                </span>
              ) : (
                <>
                  {r.added.length > 0 && (
                    <span className="text-ok">
                      +{r.added.length} added ({r.added.join(", ")})
                    </span>
                  )}
                  {r.added.length > 0 && r.skipped.length > 0 && " · "}
                  {r.skipped.length > 0 && (
                    <span className="text-text-secondary">{r.skipped.length} skipped</span>
                  )}
                  {r.added.length === 0 && r.skipped.length === 0 && (
                    <span className="text-text-secondary">{t("inventory.skillsSync.noChanges")}</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {syncableSkills.length === 0 && allSkillNames.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3">
          <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-ok" />
          <div>
            <p className="font-semibold text-ok">{t("inventory.skillsSync.allSynced")}</p>
            <p className="text-xs text-text-secondary">
              {t("inventory.skillsSync.skillCount", { count: allSkillNames.length })}
            </p>
          </div>
        </div>
      )}

      {syncableSkills.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-bg-primary px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="font-semibold uppercase tracking-wider">{t("inventory.skillsSync.syncTo")}</span>
            {TOOLS.map((tool) => (
              <label key={tool} className="flex cursor-pointer items-center gap-1 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={targetTools.has(tool)}
                  onChange={() => toggleTarget(tool)}
                  className="accent-accent"
                />
                <span className="inline-flex items-center gap-1">{toolMark(tool)} {tool}</span>
              </label>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={() => void doSync([...selected])}
              disabled={syncing || selected.size === 0 || targetTools.size === 0}
            >
              {syncing
                ? t("inventory.skillsSync.syncing")
                : t("inventory.skillsSync.syncSelected", { count: selected.size })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void doSync(syncableSkills)}
              disabled={syncing || targetTools.size === 0}
            >
              {syncing
                ? t("inventory.skillsSync.syncing")
                : t("inventory.skillsSync.syncAllMissing", { count: syncableSkills.length })}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-border px-3 py-2 text-left">
                {syncableSkills.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allMissingSelected}
                    onChange={() =>
                      setSelected(allMissingSelected ? new Set() : new Set(syncableSkills))
                    }
                    className="accent-accent"
                    title={t("inventory.skillsSync.selectMissing")}
                  />
                )}
              </th>
              <th className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Skill
              </th>
              {TOOLS.map((tool) => (
                <th
                  key={tool}
                  className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
                >
                  <span className="inline-flex items-center gap-1.5">{toolMark(tool)} {tool}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {syncableSkills.map((skill) => (
              <tr key={skill} className="bg-warn/5 transition-colors hover:bg-warn/10">
                <td className="border-b border-border/40 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(skill)}
                    onChange={() => toggleSkill(skill)}
                    className="accent-accent"
                  />
                </td>
                <td className="border-b border-border/40 px-3 py-2 font-medium">{skill}</td>
                {TOOLS.map((tool) => (
                  <td key={tool} className="border-b border-border/40 px-3 py-2">
                    {rawData[tool]?.skills?.[skill] ? <Check aria-label="synced" className="h-4 w-4 text-ok" /> : <Badge text="Missing" variant="warn" />}
                  </td>
                ))}
              </tr>
            ))}
            {allSkillNames
              .filter((name) => !syncableSkills.includes(name))
              .map((skill) => (
                <tr key={skill} className="opacity-50">
                  <td className="border-b border-border/30 px-3 py-2">
                    <input type="checkbox" disabled className="cursor-not-allowed opacity-30" />
                  </td>
                  <td className="border-b border-border/30 px-3 py-2 font-medium">{skill}</td>
                  {TOOLS.map((tool) => (
                    <td key={tool} className="border-b border-border/30 px-3 py-2">
                      <Check aria-label="synced" className="h-4 w-4 text-ok" />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-text-secondary">
        {t("inventory.skillsSync.footerTotal", { count: allSkillNames.length })}
        {" · "}
        {syncableSkills.length > 0 ? (
          <span className="text-warn">
            {t("inventory.skillsSync.footerNeedSync", { count: syncableSkills.length })}
          </span>
        ) : (
          <span className="text-ok">{t("inventory.skillsSync.allSyncedShort")}</span>
        )}
        {syncedCount > 0 && ` · ${t("inventory.skillsSync.footerFullySynced", { count: syncedCount })}`}
      </div>
    </Card>
  );
}
