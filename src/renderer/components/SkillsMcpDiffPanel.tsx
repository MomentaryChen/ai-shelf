import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Wrench, XCircle } from "lucide-react";
import type {
  ConfigAlignGap,
  ConfigAlignResult,
  McpSyncPreviewItem,
} from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Tag } from "./Tag";
import { ToolLogo } from "./ToolLogo";
import { Button } from "@/components/ui/button";
import { McpSyncPreviewDialog } from "./McpSyncPreviewDialog";
import { MCP_SYNC_TOOL_IDS, SKILL_SYNC_TOOL_IDS } from "../../tools.js";
import { useLocale } from "../i18n/LocaleProvider";

interface SkillsMcpDiffPanelProps {
  onOpenMcpSync: () => void;
}

export function SkillsMcpDiffPanel({ onOpenMcpSync }: SkillsMcpDiffPanelProps) {
  const { t } = useLocale();
  const seeded = useRef(false);
  const [mcpSource, setMcpSource] = useState("claude");
  const [skillsSource, setSkillsSource] = useState("claude");
  const [gaps, setGaps] = useState<ConfigAlignGap[]>([]);
  const [aligning, setAligning] = useState(false);
  const [alignResult, setAlignResult] = useState<ConfigAlignResult | null>(null);
  const [mcpPreviewOpen, setMcpPreviewOpen] = useState(false);
  const [mcpPreviewItems, setMcpPreviewItems] = useState<McpSyncPreviewItem[]>([]);
  const [pendingMcpAlign, setPendingMcpAlign] = useState(false);

  const refreshGaps = useCallback(async (mcp: string, skills: string) => {
    setAlignResult(null);
    try {
      const res = await window.api.getConfigAlignGaps({
        mcpSourceTool: mcp,
        skillsSourceTool: skills,
      });
      setGaps(res.gaps);
    } catch (err) {
      console.error("[SkillsMcpDiffPanel] load error:", err);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (!seeded.current) {
        try {
          const res = await window.api.getConfigAlignGaps();
          seeded.current = true;
          setMcpSource(res.mcpSource);
          setSkillsSource(res.skillsSource);
          setGaps(res.gaps);
        } catch (err) {
          console.error("[SkillsMcpDiffPanel] seed error:", err);
          seeded.current = true;
        }
        return;
      }
      await refreshGaps(mcpSource, skillsSource);
    })();
  }, [mcpSource, skillsSource, refreshGaps]);

  const mcpGaps = gaps.filter((g) => g.kind === "mcp");
  const skillGaps = gaps.filter((g) => g.kind === "skill");
  const hasGaps = mcpGaps.length > 0 || skillGaps.length > 0;

  const mcpTargets = MCP_SYNC_TOOL_IDS.filter((tool) => tool !== mcpSource);
  const skillTargets = SKILL_SYNC_TOOL_IDS.filter((tool) => tool !== skillsSource);

  const executeAlign = async (opts: { syncMcp?: boolean; syncSkills?: boolean }) => {
    setAligning(true);
    setAlignResult(null);
    try {
      const res = await window.api.alignConfigFromSource({
        mcpSourceTool: mcpSource,
        skillsSourceTool: skillsSource,
        mcpTargets: [...mcpTargets],
        skillTargets: [...skillTargets],
        syncMcp: opts.syncMcp,
        syncSkills: opts.syncSkills,
      });
      setAlignResult(res);
      if (opts.syncSkills) await window.api.startInventoryScan();
      await refreshGaps(mcpSource, skillsSource);
    } catch {
      setAlignResult({
        mcpSource,
        skillsSource,
        mcpResults: [{ tool: "all", added: [], skipped: [], error: "Align failed" }],
        skillResults: [],
      });
    } finally {
      setAligning(false);
      setMcpPreviewOpen(false);
      setPendingMcpAlign(false);
    }
  };

  const previewThenAlignMcp = async () => {
    if (mcpGaps.length === 0) return;
    const serverNames = mcpGaps.map((g) => g.name);
    try {
      const preview = await window.api.previewMcpSync({
        serverNames,
        targetTools: [...mcpTargets],
        sourceTool: mcpSource,
      });
      const adds = preview.filter((p) => p.action === "add");
      if (adds.length === 0) {
        setAlignResult({
          mcpSource,
          skillsSource,
          mcpResults: [{ tool: "all", added: [], skipped: serverNames }],
          skillResults: [],
        });
        return;
      }
      setMcpPreviewItems(preview);
      setPendingMcpAlign(true);
      setMcpPreviewOpen(true);
    } catch {
      await executeAlign({ syncMcp: true, syncSkills: false });
    }
  };

  return (
    <Card
      className={`mb-5 ${hasGaps ? "border-warn/40 bg-warn/5" : "border-ok/30 bg-ok/5"}`}
      title={
        <>
          <Wrench aria-hidden className="h-4 w-4 text-accent" />
          {t("inventory.diffFix.title")}
        </>
      }
    >
      <p className="mb-3 text-[13px] text-text-secondary">{t("inventory.diffFix.subtitle")}</p>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-xs">
        <label className="flex items-center gap-1.5 text-text-secondary">
          <span className="font-medium">{t("inventory.diffFix.mcpSource")}</span>
          <select
            value={mcpSource}
            onChange={(e) => setMcpSource(e.target.value)}
            className="rounded border border-border bg-bg-card px-2 py-1 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {MCP_SYNC_TOOL_IDS.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          <span className="font-medium">{t("inventory.diffFix.skillsSource")}</span>
          <select
            value={skillsSource}
            onChange={(e) => setSkillsSource(e.target.value)}
            className="rounded border border-border bg-bg-card px-2 py-1 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {SKILL_SYNC_TOOL_IDS.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </label>
        <span className="text-text-tertiary">{t("inventory.diffFix.missingOnlyHint")}</span>
      </div>

      {!hasGaps ? (
        <div className="flex items-center gap-3">
          <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-ok" />
          <div>
            <p className="font-semibold text-ok">{t("inventory.diffFix.allSynced")}</p>
            <p className="text-xs text-text-secondary">{t("inventory.diffFix.allSyncedHint")}</p>
          </div>
        </div>
      ) : (
        <>
          {skillGaps.length > 0 && (
            <div className="mb-4 rounded-lg border border-border/60 bg-bg-primary px-3 py-2.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t("inventory.diffFix.skillsMissing")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skillGaps.map((gap) => (
                  <Tag key={gap.name}>
                    {gap.name}
                    <span className="ml-1 text-text-tertiary">→ {gap.missingIn.join(", ")}</span>
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {mcpGaps.length > 0 && (
            <div className="mb-4 rounded-lg border border-warn/30 bg-bg-primary px-3 py-2.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-warn">
                {t("inventory.diffFix.mcpMissing")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mcpGaps.map((gap) => (
                  <Badge
                    key={gap.name}
                    text={`${gap.name} → ${gap.missingIn.join(", ")}`}
                    variant="warn"
                  />
                ))}
              </div>
            </div>
          )}

          {alignResult && (
            <div className="mb-4 rounded-lg border border-border bg-bg-primary p-3 text-sm">
              {[...alignResult.mcpResults, ...alignResult.skillResults].map((r, idx) => (
                <div key={`${r.tool}-${idx}`} className="mb-1">
                  <strong className="inline-flex items-center gap-1.5">
                    <ToolLogo tool={r.tool} size={14} /> {r.tool}
                  </strong>
                  :{" "}
                  {r.error ? (
                    <span className="inline-flex items-center gap-1 text-fail">
                      <XCircle aria-hidden className="h-3.5 w-3.5" /> {r.error}
                    </span>
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
            <Button
              size="sm"
              disabled={aligning || !hasGaps}
              onClick={() => void executeAlign({ syncMcp: true, syncSkills: true })}
            >
              {aligning ? t("inventory.diffFix.syncing") : t("inventory.diffFix.oneClickFix")}
            </Button>
            {mcpGaps.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={aligning}
                onClick={() => void previewThenAlignMcp()}
              >
                {t("inventory.diffFix.previewMcp")}
              </Button>
            )}
            {skillGaps.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={aligning}
                onClick={() => void executeAlign({ syncMcp: false, syncSkills: true })}
              >
                {t("inventory.diffFix.syncSkills")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onOpenMcpSync}>
              {t("inventory.diffFix.openMcpSync")}
            </Button>
          </div>
        </>
      )}

      <McpSyncPreviewDialog
        open={mcpPreviewOpen}
        items={mcpPreviewItems}
        syncing={aligning}
        onCancel={() => {
          setMcpPreviewOpen(false);
          setPendingMcpAlign(false);
        }}
        onConfirm={() => {
          if (pendingMcpAlign) void executeAlign({ syncMcp: true, syncSkills: false });
        }}
      />
    </Card>
  );
}
