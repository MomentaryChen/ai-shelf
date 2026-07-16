import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowUpCircle, Check, CheckCircle2, Package, PartyPopper, RefreshCw, XCircle } from "lucide-react";
import type { ProviderEntry, ToolUpdateInfo } from "../types";
import { Card } from "./Card";
import { Badge, InstallStatusBadge } from "./Badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { SectionHeading } from "./SectionHeading";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { toolIcon, toolLabel } from "../utils";
import { toolHasRemoteLatest } from "../../tools.js";
import { versionsEqual } from "../../utils/version.js";
import { useLocale } from "../i18n/LocaleProvider";
import { ToolInstallPanel } from "./ToolInstallPanel";

/** Cursor / Aider / OpenCode etc. — `agent update` reports already current. */
function updateMessageIndicatesUpToDate(message: string): boolean {
  return /already up to date|no update available|nothing to update|已是最新/i.test(message);
}

/**
 * Prefer remote latest (npm / GitHub Releases). For tools without a remote source,
 * treat current as latest after a successful update check.
 */
function effectiveLatestVersion(
  tool: string,
  currentVersion: string | null,
  latestVersion: string | null,
  syncedAfterUpdate?: boolean,
  updateMessage?: string,
): string | null {
  if (
    syncedAfterUpdate &&
    currentVersion &&
    (!toolHasRemoteLatest(tool) ||
      (updateMessage != null && updateMessageIndicatesUpToDate(updateMessage)))
  ) {
    return currentVersion;
  }
  if (latestVersion != null) return latestVersion;
  return null;
}

type UpdateMeta = Record<string, { latestVersion: string | null; updateCommand: string }>;

function buildToolUpdateInfo(
  entry: ProviderEntry,
  meta: UpdateMeta,
  versionOverrides: Record<string, string | null>,
  results: Record<string, { success: boolean; message: string }>,
): ToolUpdateInfo {
  const currentVersion = versionOverrides[entry.tool] ?? entry.version ?? null;
  const rawLatest = meta[entry.tool]?.latestVersion ?? null;
  const syncedAfterUpdate =
    results[entry.tool]?.success &&
    (!toolHasRemoteLatest(entry.tool) ||
      updateMessageIndicatesUpToDate(results[entry.tool]!.message));
  const latestVersion = effectiveLatestVersion(
    entry.tool,
    currentVersion,
    rawLatest,
    syncedAfterUpdate,
    results[entry.tool]?.message,
  );
  return {
    tool: entry.tool,
    label: toolLabel(entry.tool),
    currentVersion,
    latestVersion,
    available: entry.available,
    updateCommand: meta[entry.tool]?.updateCommand ?? "",
  };
}

function applyCheckResult(
  tools: ToolUpdateInfo[],
  setMeta: Dispatch<SetStateAction<UpdateMeta>>,
  setSelfTool: Dispatch<SetStateAction<ToolUpdateInfo | null>>,
  setVersionOverrides: Dispatch<SetStateAction<Record<string, string | null>>>,
) {
  const nextMeta: UpdateMeta = {};
  let self: ToolUpdateInfo | null = null;
  const versions: Record<string, string | null> = {};
  for (const t of tools) {
    if (t.tool === "ai-shelf") {
      self = t;
      versions["ai-shelf"] = t.currentVersion;
    } else {
      nextMeta[t.tool] = {
        latestVersion: t.latestVersion,
        updateCommand: t.updateCommand,
      };
      versions[t.tool] = t.currentVersion;
    }
  }
  setMeta(nextMeta);
  setSelfTool(self);
  setVersionOverrides(versions);
}

export function UpdateTab({
  data,
  onRefresh,
}: {
  data: ProviderEntry[];
  onRefresh?: () => void;
}) {
  const { t } = useLocale();
  const { installed, notInstalled } = partitionByInstalled(data);
  const [meta, setMeta] = useState<UpdateMeta>({});
  const [selfTool, setSelfTool] = useState<ToolUpdateInfo | null>(null);
  const [versionOverrides, setVersionOverrides] = useState<Record<string, string | null>>({});
  const [checkingAll, setCheckingAll] = useState(true);
  const [checkingTools, setCheckingTools] = useState<Record<string, boolean>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const runCheckAll = useCallback(async (clearResults = true) => {
    setCheckingAll(true);
    if (clearResults) setResults({});
    try {
      const { tools } = await window.api.checkUpdate();
      applyCheckResult(tools, setMeta, setSelfTool, setVersionOverrides);
    } finally {
      setCheckingAll(false);
    }
  }, []);

  const refreshOneTool = useCallback(async (tool: string) => {
    setCheckingTools((prev) => ({ ...prev, [tool]: true }));
    try {
      const info = await window.api.refreshToolUpdateInfo(tool);
      if (!info) return;
      if (info.tool === "ai-shelf") {
        setSelfTool(info);
        setVersionOverrides((prev) => ({ ...prev, "ai-shelf": info.currentVersion }));
      } else {
        const latest = effectiveLatestVersion(
          info.tool,
          info.currentVersion,
          info.latestVersion,
          true,
        );
        setMeta((prev) => ({
          ...prev,
          [info.tool]: {
            latestVersion: latest,
            updateCommand: info.updateCommand,
          },
        }));
        setVersionOverrides((prev) => ({ ...prev, [info.tool]: info.currentVersion }));
      }
    } finally {
      setCheckingTools((prev) => {
        const next = { ...prev };
        delete next[tool];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    void runCheckAll(false);
  }, [runCheckAll]);

  const installedTools = useMemo(
    () => installed.map((e) => buildToolUpdateInfo(e, meta, versionOverrides, results)),
    [installed, meta, versionOverrides, results],
  );

  const selfEntry = useMemo((): ToolUpdateInfo | null => {
    if (!selfTool) return null;
    return {
      ...selfTool,
      currentVersion: versionOverrides["ai-shelf"] ?? selfTool.currentVersion,
    };
  }, [selfTool, versionOverrides]);

  const checkableTools = useMemo(() => {
    const list = [...installedTools];
    if (selfEntry) list.push(selfEntry);
    return list;
  }, [installedTools, selfEntry]);

  const handleUpdate = async (tool: string) => {
    setUpdating((prev) => ({ ...prev, [tool]: true }));
    setResults((prev) => {
      const n = { ...prev };
      delete n[tool];
      return n;
    });
    try {
      const res = await window.api.runUpdate(tool);
      setResults((prev) => ({ ...prev, [tool]: res }));
      if (res.success) await refreshOneTool(tool);
    } catch {
      setResults((prev) => ({
        ...prev,
        [tool]: { success: false, message: "Update failed unexpectedly" },
      }));
    } finally {
      setUpdating((prev) => ({ ...prev, [tool]: false }));
    }
  };

  const outdatedTools = checkableTools.filter(
    (t) => t.latestVersion != null && !versionsEqual(t.currentVersion, t.latestVersion),
  );
  const anyChecking = checkingAll || Object.keys(checkingTools).length > 0;
  const allUpToDate = !anyChecking && checkableTools.length > 0 && outdatedTools.length === 0;
  const hasUpdates = !anyChecking && outdatedTools.length > 0;
  const installedSectionCount = installed.length + (selfEntry ? 1 : 0);

  return (
    <>
      <SectionHeading icon={RefreshCw}>
        {t("app.tab.update")}
        {checkingAll && (
          <span className="animate-pulse text-sm font-normal text-text-secondary">{t("inventory.update.checking")}</span>
        )}
      </SectionHeading>

      <div className="mb-3 flex justify-end">
        <Button variant="outline" onClick={() => void runCheckAll(false)} disabled={checkingAll}>
          <RefreshCw aria-hidden className={checkingAll ? "animate-spin" : ""} />
          {t("inventory.update.recheckAll")}
        </Button>
      </div>

      {!anyChecking && checkableTools.length === 0 && (
        <EmptyState icon={<Package aria-hidden className="h-9 w-9 text-text-tertiary" />} title={t("inventory.update.noTools")} />
      )}

      {allUpToDate && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3">
          <PartyPopper aria-hidden className="h-6 w-6 shrink-0 text-ok" />
          <div>
            <p className="font-semibold text-ok">{t("inventory.update.allUpToDate")}</p>
            <p className="text-xs text-text-secondary">
              {t("inventory.update.toolsChecked", { n: checkableTools.length })}
            </p>
          </div>
        </div>
      )}

      {hasUpdates && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
          <ArrowUpCircle aria-hidden className="h-6 w-6 shrink-0 text-warn" />
          <div>
            <p className="font-semibold text-warn">
              {t("inventory.update.toolsCanUpdate", { n: outdatedTools.length })}
            </p>
            <p className="text-xs text-text-secondary">{t("inventory.update.useCards")}</p>
          </div>
        </div>
      )}

      <InventorySectionHeader count={installedSectionCount} variant="installed" />
      <div className="ui-stagger-children">
      {selfEntry && (
        <ToolUpdateCard
          tool={selfEntry}
          isChecking={(checkingAll && selfEntry.latestVersion == null) || (checkingTools["ai-shelf"] ?? false)}
          isUpdating={updating["ai-shelf"] ?? false}
          result={results["ai-shelf"]}
          onUpdate={() => void handleUpdate("ai-shelf")}
        />
      )}
      {installedTools.map((t) => (
        <ToolUpdateCard
          key={t.tool}
          tool={t}
          isChecking={(checkingAll && t.latestVersion == null) || (checkingTools[t.tool] ?? false)}
          isUpdating={updating[t.tool] ?? false}
          result={results[t.tool]}
          onUpdate={() => void handleUpdate(t.tool)}
        />
      ))}
      </div>

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <div className="ui-stagger-children">
      {notInstalled.map((entry) => (
        <NotInstalledUpdateCard key={entry.tool} entry={entry} onRefresh={onRefresh} />
      ))}
      </div>
    </>
  );
}

function NotInstalledUpdateCard({
  entry,
  onRefresh,
}: {
  entry: ProviderEntry;
  onRefresh?: () => void;
}) {
  const { t } = useLocale();
  return (
    <Card
      dense
      className={installedCardClass(false)}
      title={<ToolNameCell entry={entry} />}
      trailing={<InstallStatusBadge available={false} />}
    >
      <p className="mb-2 text-[13px] text-text-tertiary">{t("inventory.skipUpdate")}</p>
      <ToolInstallPanel tool={entry.tool} onInstalled={onRefresh} />
    </Card>
  );
}

function ToolUpdateCard({
  tool: toolInfo,
  isChecking,
  isUpdating,
  result,
  onUpdate,
}: {
  tool: ToolUpdateInfo;
  isChecking: boolean;
  isUpdating: boolean;
  result?: { success: boolean; message: string };
  onUpdate: () => void;
}) {
  const { t } = useLocale();
  const icon = toolIcon(toolInfo.tool === "ai-shelf" ? "" : toolInfo.tool);
  const isOutdated =
    toolInfo.latestVersion != null &&
    toolInfo.currentVersion != null &&
    !versionsEqual(toolInfo.currentVersion, toolInfo.latestVersion);
  const isUpToDate =
    toolInfo.latestVersion != null &&
    toolInfo.currentVersion != null &&
    versionsEqual(toolInfo.currentVersion, toolInfo.latestVersion);

  const badge = isChecking
    ? <Badge text={t("inventory.update.checking")} variant="info" />
    : isOutdated
      ? <Badge text={t("inventory.update.updateAvailable")} variant="warn" />
      : isUpToDate
        ? <Badge text={t("inventory.update.upToDate")} variant="ok" />
        : <Badge text={t("inventory.installedBadge")} variant="info" />;

  return (
    <Card dense title={<>{icon} {toolInfo.label}</>} trailing={badge}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {isOutdated ? (
            <>
              <span className="rounded bg-bg-primary/60 px-2 py-0.5 font-mono font-semibold text-fail">
                v{toolInfo.currentVersion}
              </span>
              <span className="text-base text-text-secondary">→</span>
              <span className="rounded bg-bg-primary/60 px-2 py-0.5 font-mono font-semibold text-ok">
                v{toolInfo.latestVersion}
              </span>
            </>
          ) : (
            <>
              <span className="text-text-secondary">{t("inventory.update.version")}</span>
              <span className={`font-mono font-semibold ${isUpToDate ? "text-ok" : "text-text-primary"}`}>
                {toolInfo.currentVersion ?? "—"}
              </span>
              {isUpToDate && <Check aria-hidden className="h-4 w-4 text-ok" />}
              {isChecking && (
                <span className="animate-pulse text-xs text-text-secondary">{t("inventory.update.checkingLatest")}</span>
              )}
            </>
          )}
        </div>

        {toolInfo.updateCommand && (
          <div className="rounded bg-bg-primary/60 px-3 py-2 font-mono text-xs text-text-secondary">
            $ {toolInfo.updateCommand}
          </div>
        )}

        {toolInfo.desktopUpdate && !toolInfo.updateCommand && (
          <p className="text-xs text-text-secondary">{t("inventory.update.desktopHint")}</p>
        )}

        {(toolInfo.updateCommand || toolInfo.desktopUpdate) && !isChecking && (
          isUpToDate ? (
            <div className="flex items-center gap-2 text-sm text-ok">
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              <span>{t("inventory.update.noUpdateNeeded")}</span>
            </div>
          ) : (
            <Button onClick={onUpdate} disabled={isUpdating}>
              {isUpdating
                ? t("inventory.update.updating")
                : t("inventory.update.runUpdate")}
            </Button>
          )
        )}

        {result && (
          <div
            className={`rounded-lg p-3 text-sm ${result.success ? "bg-ok/10 text-ok" : "bg-fail/10 text-fail"}`}
          >
            {result.success ? (
              <p className="mb-0 flex items-center gap-1.5">
                <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" /> {result.message}
              </p>
            ) : (
              <div className="flex items-start gap-1.5">
                <XCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <pre className="max-h-32 flex-1 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                  {result.message}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
