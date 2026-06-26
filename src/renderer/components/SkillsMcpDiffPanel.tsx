import { useCallback, useEffect, useState } from "react";
import type { McpRawData, McpSyncPreviewItem, McpSyncResult, ProviderEntry, SkillSyncResult } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Tag } from "./Tag";
import { McpSyncPreviewDialog } from "./McpSyncPreviewDialog";
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
  const [syncingMcp, setSyncingMcp] = useState(false);
  const [syncingSkills, setSyncingSkills] = useState(false);
  const [mcpResults, setMcpResults] = useState<McpSyncResult[] | null>(null);
  const [skillResults, setSkillResults] = useState<SkillSyncResult[] | null>(null);
  const [mcpPreviewOpen, setMcpPreviewOpen] = useState(false);
  const [mcpPreviewItems, setMcpPreviewItems] = useState<McpSyncPreviewItem[]>([]);

  const claude = findProviderEntry(data, "claude");
  const cursor = findProviderEntry(data, "cursor");

  const load = useCallback(async () => {
    setMcpResults(null);
    setSkillResults(null);
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
  const hasSkillsGap = missingSkills.length > 0;

  if (!hasMcpGap && !hasSkillsGap) {
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

  const executeMcpSync = async () => {
    if (missingMcp.length === 0) return;
    setSyncingMcp(true);
    setMcpResults(null);
    try {
      const res = await window.api.syncMcp({
        serverNames: missingMcp,
        targetTools: ["cursor"],
      });
      setMcpResults(res);
      await load();
    } catch {
      setMcpResults([{ tool: "cursor", added: [], skipped: [], error: "Sync failed" }]);
    } finally {
      setSyncingMcp(false);
      setMcpPreviewOpen(false);
    }
  };

  const doMcpSync = async () => {
    if (missingMcp.length === 0) return;
    try {
      const preview = await window.api.previewMcpSync({
        serverNames: missingMcp,
        targetTools: ["cursor"],
      });
      const adds = preview.filter((p) => p.action === "add");
      if (adds.length === 0) {
        setMcpResults([{ tool: "cursor", added: [], skipped: missingMcp }]);
        return;
      }
      setMcpPreviewItems(preview);
      setMcpPreviewOpen(true);
    } catch {
      await executeMcpSync();
    }
  };

  const doSkillsSync = async () => {
    if (missingSkills.length === 0) return;
    setSyncingSkills(true);
    setSkillResults(null);
    try {
      const res = await window.api.syncSkills({
        skillNames: missingSkills,
        targetTools: ["cursor"],
      });
      setSkillResults(res);
      await window.api.startInventoryScan();
    } catch {
      setSkillResults([{ tool: "cursor", added: [], skipped: [], error: "Sync failed" }]);
    } finally {
      setSyncingSkills(false);
    }
  };

  return (
    <Card
      className={`mb-5 ${hasMcpGap || hasSkillsGap ? "border-warn/40 bg-warn/5" : "border-border"}`}
      title={`🔧 ${t("inventory.diffFix.title")}`}
    >
      <p className="mb-3 text-[13px] text-text-secondary">{t("inventory.diffFix.subtitle")}</p>

      {hasSkillsGap && (
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

          {skillResults && (
            <div className="mt-3 rounded-lg border border-border bg-bg-primary p-3">
              {skillResults.map((r) => (
                <div key={r.tool} className="text-sm">
                  <strong>📐 {r.tool}</strong>:{" "}
                  {r.error ? (
                    <span className="text-fail">❌ {r.error}</span>
                  ) : r.added.length > 0 ? (
                    <span className="text-ok">
                      {t("inventory.diffFix.syncSkillsAdded", { names: r.added.join(", ") })}
                    </span>
                  ) : (
                    <span className="text-text-secondary">{t("inventory.skillsSync.noChanges")}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => void doSkillsSync()}
              disabled={syncingSkills}
              className="cursor-pointer rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncingSkills ? t("inventory.diffFix.syncing") : t("inventory.diffFix.syncSkills")}
            </button>
          </div>
        </div>
      )}

      {hasMcpGap ? (
        <>
          <div className="mb-4 rounded-lg border border-warn/30 bg-bg-primary px-3 py-2.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-warn">
              {t("inventory.diffFix.mcpMissing")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingMcp.map((server) => (
                <Badge key={server} text={`🔌 ${server}`} variant="warn" />
              ))}
            </div>
          </div>

          {mcpResults && (
            <div className="mb-4 rounded-lg border border-border bg-bg-primary p-3">
              {mcpResults.map((r) => (
                <div key={r.tool} className="text-sm">
                  <strong>📐 {r.tool}</strong>:{" "}
                  {r.error ? (
                    <span className="text-fail">❌ {r.error}</span>
                  ) : r.added.length > 0 ? (
                    <span className="text-ok">
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
              onClick={() => void doMcpSync()}
              disabled={syncingMcp}
              className="cursor-pointer rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncingMcp ? t("inventory.diffFix.syncing") : t("inventory.diffFix.oneClickFix")}
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

      <McpSyncPreviewDialog
        open={mcpPreviewOpen}
        items={mcpPreviewItems}
        syncing={syncingMcp}
        onCancel={() => setMcpPreviewOpen(false)}
        onConfirm={() => void executeMcpSync()}
      />
    </Card>
  );
}
