import { useCallback, useEffect, useState } from "react";
import type { McpRawData, McpSyncResult, ProviderEntry } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Tag } from "./Tag";
import {
  findProviderEntry,
  mcpServersMissingInCursor,
  skillsMissingInCursor,
} from "../utils/claude-cursor-diff";
import { useLocale } from "../i18n/LocaleProvider";

interface SkillsMcpDiffPanelProps {
  data: ProviderEntry[];
  onOpenMcpSync: () => void;
}

export function SkillsMcpDiffPanel({ data, onOpenMcpSync }: SkillsMcpDiffPanelProps) {
  const { t } = useLocale();
  const [rawData, setRawData] = useState<McpRawData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<McpSyncResult[] | null>(null);

  const claude = findProviderEntry(data, "claude");
  const cursor = findProviderEntry(data, "cursor");

  const load = useCallback(async () => {
    setResults(null);
    try {
      const next = await window.api.getMcpRaw();
      setRawData(next);
    } catch (err) {
      console.error("[SkillsMcpDiffPanel] load error:", err);
    }
  }, []);

  useEffect(() => {
    if (claude?.available && cursor?.available) {
      void load();
    }
  }, [claude?.available, cursor?.available, load]);

  if (!claude?.available || !cursor?.available || !rawData) return null;

  const missingMcp = mcpServersMissingInCursor(rawData);
  const missingSkills = skillsMissingInCursor(claude, cursor);
  const hasMcpGap = missingMcp.length > 0;

  if (!hasMcpGap && missingSkills.length === 0) {
    return (
      <Card className="mb-5 border-ok/30 bg-ok/5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-ok">{t("inventory.diffFix.allSynced")}</p>
            <p className="text-xs text-text-secondary">{t("inventory.diffFix.allSyncedHint")}</p>
          </div>
        </div>
      </Card>
    );
  }

  const doSync = async () => {
    if (missingMcp.length === 0) return;
    setSyncing(true);
    setResults(null);
    try {
      const res = await window.api.syncMcp({
        serverNames: missingMcp,
        targetTools: ["cursor"],
      });
      setResults(res);
      await load();
    } catch {
      setResults([{ tool: "cursor", added: [], skipped: [], error: "Sync failed" }]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      className={`mb-5 ${hasMcpGap ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}
      title={`🔧 ${t("inventory.diffFix.title")}`}
    >
      <p className="mb-3 text-[13px] text-text-secondary">{t("inventory.diffFix.subtitle")}</p>

      {missingSkills.length > 0 && (
        <div className="mb-4 rounded-lg border border-border/60 bg-bg-primary px-3 py-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("inventory.diffFix.skillsMissing")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingSkills.map((skill) => (
              <Tag key={skill}>{skill}</Tag>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-tertiary">{t("inventory.diffFix.skillsMissingHint")}</p>
        </div>
      )}

      {hasMcpGap ? (
        <>
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-bg-primary px-3 py-2.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
              {t("inventory.diffFix.mcpMissing")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingMcp.map((server) => (
                <Badge key={server} text={`🔌 ${server}`} variant="warn" />
              ))}
            </div>
          </div>

          {results && (
            <div className="mb-4 rounded-lg border border-border bg-bg-primary p-3">
              {results.map((r) => (
                <div key={r.tool} className="text-sm">
                  <strong>📐 {r.tool}</strong>:{" "}
                  {r.error ? (
                    <span className="text-red-400">❌ {r.error}</span>
                  ) : r.added.length > 0 ? (
                    <span className="text-green-400">
                      {t("inventory.diffFix.syncAdded", { names: r.added.join(", ") })}
                    </span>
                  ) : (
                    <span className="text-text-secondary">{t("inventory.mcpSync.noChanges")}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void doSync()}
              disabled={syncing}
              className="cursor-pointer rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? t("inventory.diffFix.syncing") : t("inventory.diffFix.oneClickFix")}
            </button>
            <button
              type="button"
              onClick={onOpenMcpSync}
              className="cursor-pointer rounded-md border border-border bg-bg-card px-3 py-1.5 text-xs text-text-primary transition hover:border-accent"
            >
              {t("inventory.diffFix.openMcpSync")}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpenMcpSync}
          className="cursor-pointer rounded-md border border-border bg-bg-card px-3 py-1.5 text-xs text-text-primary transition hover:border-accent"
        >
          {t("inventory.diffFix.openMcpSync")}
        </button>
      )}
    </Card>
  );
}
