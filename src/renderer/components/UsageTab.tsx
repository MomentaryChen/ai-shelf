import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  UsageAttributionRow,
  UsageCostInsights,
  UsageCredentialStatus,
  UsageDailyUnifiedRow,
  UsageDashboardResult,
  UsageProviderMeta,
  UsageToolId,
  UsageToolSnapshot,
} from "../types";
import { Card } from "./Card";
import { StatCard } from "./StatCard";
import { DataTable, Td } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { toolIcon, toolLabel } from "../utils";

type UsageScope = "all" | UsageToolId;

function UsageToolHeader({ toolId }: { toolId: UsageToolId }) {
  const id = toolId === "codex" ? "codex" : toolId;
  return (
    <div className="flex items-center gap-2">
      {toolIcon(id)}
      <strong className="text-[var(--ink)]">{toolLabel(id)}</strong>
    </div>
  );
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTokens(n?: number): string {
  if (n == null || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function statusLabel(
  snapshot: UsageToolSnapshot,
  t: (key: MessageKey) => string,
): string {
  switch (snapshot.status) {
    case "ok":
      return t("usage.status.ok");
    case "not_configured":
      return t("usage.status.notConfigured");
    case "unsupported":
      return t("usage.status.unsupported");
    case "error":
      return t("usage.status.error");
    default:
      return "—";
  }
}

function UsageToolNav({
  scope,
  tools,
  onSelect,
}: {
  scope: UsageScope;
  tools: UsageToolSnapshot[];
  onSelect: (scope: UsageScope) => void;
}) {
  const { t } = useLocale();
  const costByTool = useMemo(
    () => new Map(tools.map((snap) => [snap.toolId, snap.totalCostUsd ?? 0])),
    [tools],
  );

  return (
    <nav
      aria-label={t("usage.view.selectTool")}
      className="mb-4 flex flex-wrap gap-1.5"
    >
      <button
        type="button"
        aria-current={scope === "all" ? "true" : undefined}
        onClick={() => onSelect("all")}
        className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-200 ${
          scope === "all"
            ? "bg-[var(--clay)] font-medium text-white shadow-[var(--shadow-accent)]"
            : "bg-[var(--sand)] text-[var(--ink)] hover:bg-[var(--sand-deep)]"
        }`}
      >
        {t("usage.view.all")}
      </button>
      {tools.map((snap) => {
        const active = scope === snap.toolId;
        const cost = costByTool.get(snap.toolId) ?? 0;
        return (
          <button
            key={snap.toolId}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(snap.toolId)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2.5 text-[13px] transition-colors duration-200 ${
              active
                ? "bg-[var(--clay)] font-medium text-white shadow-[var(--shadow-accent)]"
                : "bg-[var(--sand)] text-[var(--ink)] hover:bg-[var(--sand-deep)]"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">{toolIcon(snap.toolId)}</span>
            <span>{toolLabel(snap.toolId)}</span>
            {snap.status === "ok" && cost > 0 && (
              <span
                className={`tabular-nums text-[11px] ${active ? "text-white/85" : "text-[var(--muted)]"}`}
              >
                {formatUsd(cost)}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function ToolCredentialRow({
  provider,
  status,
  encryptionAvailable,
  onSaved,
}: {
  provider: UsageProviderMeta;
  status?: UsageCredentialStatus;
  encryptionAvailable: boolean;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busyField, setBusyField] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const fieldGroups = useMemo(() => {
    const groups = new Map<string, UsageProviderMeta["fields"]>();
    for (const field of provider.fields) {
      const key = field.groupKey ?? "default";
      const list = groups.get(key) ?? [];
      list.push(field);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [provider.fields]);

  const isFieldConfigured = (fieldKey: string) =>
    status?.methods?.some((m) => m.fieldKey === fieldKey) ?? false;

  const fieldMaskedHint = (fieldKey: string) =>
    status?.methods?.find((m) => m.fieldKey === fieldKey)?.maskedHint;

  const saveField = async (fieldKey: string) => {
    const value = values[fieldKey] ?? "";
    setBusyField(fieldKey);
    setMessages((m) => ({ ...m, [fieldKey]: "" }));
    const res = await window.api.usageSetCredential(provider.toolId, fieldKey, value);
    setBusyField(null);
    if (res.ok) {
      setValues((v) => ({ ...v, [fieldKey]: "" }));
      setMessages((m) => ({ ...m, [fieldKey]: t("usage.credential.saved") }));
      onSaved();
    } else {
      setMessages((m) => ({ ...m, [fieldKey]: res.error ?? t("usage.credential.saveFailed") }));
    }
  };

  const clearField = async (fieldKey: string) => {
    setBusyField(fieldKey);
    setMessages((m) => ({ ...m, [fieldKey]: "" }));
    await window.api.usageSetCredential(provider.toolId, fieldKey, "");
    setBusyField(null);
    setValues((v) => ({ ...v, [fieldKey]: "" }));
    setMessages((m) => ({ ...m, [fieldKey]: t("usage.credential.cleared") }));
    onSaved();
  };

  const testField = async (fieldKey: string) => {
    setBusyField(fieldKey);
    setMessages((m) => ({ ...m, [fieldKey]: "" }));
    const res = await window.api.usageTestCredential(provider.toolId, fieldKey);
    setBusyField(null);
    setMessages((m) => ({
      ...m,
      [fieldKey]: res.ok ? t("usage.credential.testOk") : (res.error ?? t("usage.credential.testFailed")),
    }));
  };

  return (
    <div className="rounded-[22px] border border-[var(--sand)] bg-[var(--cream)]/60 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <UsageToolHeader toolId={provider.toolId} />
          {provider.supported ? (
            <span className="rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[11px] text-[var(--success)]">
              {t("usage.badge.api")}
            </span>
          ) : (
            <span className="rounded-full bg-[var(--sand-deep)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              {t("usage.badge.comingSoon")}
            </span>
          )}
        </div>
        {status?.configured && status.maskedHint && (
          <span className="font-mono text-[11px] text-[var(--muted)]">{status.maskedHint}</span>
        )}
      </div>

      {provider.unsupportedReason && (
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">{provider.unsupportedReason}</p>
      )}

      {provider.credentialNoteKey && (
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
          {t(provider.credentialNoteKey as MessageKey)}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {fieldGroups.map(([groupKey, fields]) => {
          const groupLabelKey = fields[0]?.groupLabelKey;
          return (
            <div
              key={groupKey}
              className="rounded-[18px] border border-[var(--sand)]/80 bg-[var(--surface)]/40 p-3.5"
            >
              {groupLabelKey && (
                <div className="mb-2 text-[13px] font-medium text-[var(--ink)]">
                  {t(groupLabelKey as MessageKey)}
                </div>
              )}
              {fields.map((field) => {
                const label = field.labelKey
                  ? t(field.labelKey as MessageKey)
                  : field.label;
                const configured = isFieldConfigured(field.key);
                const busy = busyField === field.key;
                return (
                  <div key={field.key} className="flex flex-col gap-2">
                    {field.noteKey && (
                      <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                        {t(field.noteKey as MessageKey)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-[13px] text-[var(--ink)]">{label}</Label>
                      {configured && fieldMaskedHint(field.key) && (
                        <span className="font-mono text-[11px] text-[var(--muted)]">
                          {fieldMaskedHint(field.key)}
                        </span>
                      )}
                    </div>
                    <Input
                      type="password"
                      autoComplete="off"
                      disabled={!encryptionAvailable || busyField !== null}
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.key]: e.target.value }))
                      }
                      className="border-[var(--sand)] bg-[var(--cream)]"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={
                          !encryptionAvailable || busyField !== null || !(values[field.key] ?? "").trim()
                        }
                        onClick={() => void saveField(field.key)}
                      >
                        {busy ? "…" : t("usage.credential.save")}
                      </Button>
                      {configured && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyField !== null}
                            onClick={() => void clearField(field.key)}
                          >
                            {busy ? "…" : t("usage.credential.clearField")}
                          </Button>
                          {provider.supported && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyField !== null}
                              onClick={() => void testField(field.key)}
                            >
                              {busy ? "…" : t("usage.credential.test")}
                            </Button>
                          )}
                        </>
                      )}
                      {field.helpUrl && (
                        <button
                          type="button"
                          className="cursor-pointer text-[12px] text-[var(--clay)] underline-offset-2 hover:underline"
                          onClick={() => window.api.openExternal(field.helpUrl!)}
                        >
                          {field.helpLinkKey
                            ? t(field.helpLinkKey as MessageKey)
                            : t("usage.credential.howToGet")}
                        </button>
                      )}
                    </div>
                    {messages[field.key] && (
                      <p className="text-[12px] text-[var(--muted)]">{messages[field.key]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatResetAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const USAGE_TOOL_BAR_COLORS: Record<UsageToolId, string> = {
  claude: "var(--clay)",
  codex: "var(--success)",
  cursor: "var(--muted)",
  gemini: "var(--clay-soft)",
  copilot: "var(--clay-deep)",
};

function ToolUsageDetail({ snapshot }: { snapshot: UsageToolSnapshot }) {
  const { t } = useLocale();

  if (snapshot.status === "unsupported") {
    return (
      <p className="text-[13px] text-[var(--muted)]">{snapshot.error ?? t("usage.tool.unsupported")}</p>
    );
  }

  if (snapshot.status === "not_configured") {
    return <p className="text-[13px] text-[var(--muted)]">{t("usage.tool.notConfigured")}</p>;
  }

  if (snapshot.status === "error") {
    return <p className="text-[13px] text-[var(--clay-deep)]">{snapshot.error}</p>;
  }

  const quotaMode = (snapshot.quotas?.length ?? 0) > 0 && snapshot.daily.length === 0;
  const showCursorSpending =
    snapshot.toolId === "cursor" && (snapshot.quotas?.length ?? 0) > 0;
  const quotaHintKey =
    snapshot.toolId === "cursor"
      ? "usage.cursor.quota.hint"
      : snapshot.toolId === "gemini"
        ? "usage.gemini.quota.hint"
        : snapshot.toolId === "claude"
          ? "usage.claude.quota.hint"
          : "usage.claude.quota.hint";
  const showCostGrid =
    !quotaMode ||
    showCursorSpending ||
    (snapshot.totalCostUsd ?? 0) > 0 ||
    (snapshot.totalInputTokens ?? 0) > 0 ||
    (snapshot.totalOutputTokens ?? 0) > 0;

  return (
    <>
      {(quotaMode || showCursorSpending) && snapshot.quotas && snapshot.quotas.length > 0 && (
        <div className="mb-4">
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
            {t(quotaHintKey as MessageKey)}
          </p>
          <div className="flex flex-col gap-2.5">
            {snapshot.quotas.map((q) => (
              <div key={q.key} className="rounded-[16px] bg-[var(--sand)]/50 px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-[var(--ink)]">
                    {q.label ?? t(q.labelKey as MessageKey)}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-[var(--clay)]">
                    {q.usedPercent}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--sand-deep)]">
                  <div
                    className="h-full rounded-full bg-[var(--clay)] transition-all duration-300"
                    style={{ width: `${Math.min(100, q.usedPercent)}%` }}
                  />
                </div>
                {q.remainingUsd != null && q.limitUsd != null && (
                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                    {t("usage.cursor.quota.remaining", {
                      remaining: formatUsd(q.remainingUsd),
                      limit: formatUsd(q.limitUsd),
                    })}
                  </p>
                )}
                {q.resetAt && (
                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                    {t("usage.claude.quota.resetsAt", { time: formatResetAt(q.resetAt) })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showCostGrid && (
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
          <div className="rounded-[16px] bg-[var(--sand)]/50 px-3 py-2">
            <div className="text-[10px] text-[var(--muted)]">{t("usage.table.cost")}</div>
            <div className="text-[18px] font-medium tabular-nums text-[var(--clay)]">
              {formatUsd(snapshot.totalCostUsd ?? 0)}
            </div>
          </div>
          {!quotaMode && (
            <>
              <div className="rounded-[16px] bg-[var(--sand)]/50 px-3 py-2">
                <div className="text-[10px] text-[var(--muted)]">{t("usage.metric.inputTokens")}</div>
                <div className="text-[18px] font-medium tabular-nums">
                  {formatTokens(snapshot.totalInputTokens)}
                </div>
              </div>
              <div className="rounded-[16px] bg-[var(--sand)]/50 px-3 py-2">
                <div className="text-[10px] text-[var(--muted)]">{t("usage.metric.outputTokens")}</div>
                <div className="text-[18px] font-medium tabular-nums">
                  {formatTokens(snapshot.totalOutputTokens)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {snapshot.daily.length > 0 && (
        <DataTable
          headers={[t("usage.table.date"), t("usage.table.cost"), t("usage.table.input"), t("usage.table.output")]}
        >
          {snapshot.daily.map((row) => (
            <tr key={row.date}>
              <Td className="font-mono text-[12px]">{row.date}</Td>
              <Td className="tabular-nums">{formatUsd(row.costUsd)}</Td>
              <Td className="tabular-nums">{formatTokens(row.inputTokens)}</Td>
              <Td className="tabular-nums">{formatTokens(row.outputTokens)}</Td>
            </tr>
          ))}
        </DataTable>
      )}

      {snapshot.byModel && snapshot.byModel.length > 0 && (
        <div className="mt-4 border-t border-[var(--sand)] pt-4">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-[var(--muted)]">
            {t("usage.byModel")}
          </div>
          <div className="flex flex-col gap-1">
            {snapshot.byModel.slice(0, 12).map((m) => (
              <div key={m.model} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate font-mono">{m.model}</span>
                <span className="shrink-0 tabular-nums text-[var(--ink)]">
                  {m.costUsd > 0 ? formatUsd(m.costUsd) : formatTokens(m.inputTokens)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function UsageUnifiedDaily({
  rows,
  activeToolIds,
  quotaOnlyToolIds,
  onSelectTool,
}: {
  rows: UsageDailyUnifiedRow[];
  activeToolIds: UsageToolId[];
  quotaOnlyToolIds: UsageToolId[];
  onSelectTool: (toolId: UsageToolId) => void;
}) {
  const { t } = useLocale();
  const maxCost = useMemo(() => Math.max(0, ...rows.map((r) => r.costUsd)), [rows]);

  if (rows.length === 0) {
    return (
      <Card title={t("usage.unified.title")}>
        <p className="text-[13px] text-[var(--muted)]">
          {activeToolIds.length > 0 ? t("usage.unified.noDaily") : t("usage.unified.empty")}
        </p>
      </Card>
    );
  }

  return (
    <Card title={t("usage.unified.title")}>
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">{t("usage.unified.hint")}</p>
      {quotaOnlyToolIds.length > 0 && (
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">{t("usage.unified.quotaNote")}</p>
      )}

      {maxCost > 0 && (
        <div className="mb-5 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.date} className="flex items-center gap-3">
              <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-[var(--muted)]">
                {row.date.slice(5)}
              </span>
              <div
                className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--sand-deep)]"
                style={{ maxWidth: `${(row.costUsd / maxCost) * 100}%` }}
              >
                {activeToolIds.map((toolId) => {
                  const slice = row.byTool[toolId];
                  if (!slice || slice.costUsd <= 0) return null;
                  const share = row.costUsd > 0 ? (slice.costUsd / row.costUsd) * 100 : 0;
                  return (
                    <button
                      key={toolId}
                      type="button"
                      title={`${toolLabel(toolId)} ${formatUsd(slice.costUsd)}`}
                      onClick={() => onSelectTool(toolId)}
                      className="h-full min-w-0 cursor-pointer border-0 p-0 transition-opacity hover:opacity-80"
                      style={{
                        flex: `0 0 ${share}%`,
                        backgroundColor: USAGE_TOOL_BAR_COLORS[toolId],
                      }}
                    />
                  );
                })}
              </div>
              <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-[var(--ink)]">
                {formatUsd(row.costUsd)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-3">
        {activeToolIds.map((toolId) => (
          <button
            key={toolId}
            type="button"
            onClick={() => onSelectTool(toolId)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--sand)]/60 px-2.5 py-1 text-[11px] text-[var(--ink)] hover:bg-[var(--sand)]"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: USAGE_TOOL_BAR_COLORS[toolId] }}
            />
            {toolLabel(toolId)}
          </button>
        ))}
      </div>

      <DataTable
        headers={[
          t("usage.table.date"),
          t("usage.table.cost"),
          t("usage.table.input"),
          t("usage.table.output"),
          t("usage.byTool"),
        ]}
      >
        {[...rows].reverse().map((row) => (
          <tr key={row.date}>
            <Td className="font-mono text-[12px]">{row.date}</Td>
            <Td className="tabular-nums">{formatUsd(row.costUsd)}</Td>
            <Td className="tabular-nums">{formatTokens(row.inputTokens)}</Td>
            <Td className="tabular-nums">{formatTokens(row.outputTokens)}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                {activeToolIds.map((toolId) => {
                  const slice = row.byTool[toolId];
                  if (!slice) return null;
                  const hasData =
                    slice.costUsd > 0 ||
                    (slice.inputTokens ?? 0) > 0 ||
                    (slice.outputTokens ?? 0) > 0;
                  if (!hasData) return null;
                  return (
                    <button
                      key={toolId}
                      type="button"
                      onClick={() => onSelectTool(toolId)}
                      className="cursor-pointer rounded-full bg-[var(--sand)] px-2 py-0.5 text-[11px] text-[var(--ink)] hover:bg-[var(--sand-deep)]"
                    >
                      {toolLabel(toolId)}{" "}
                      <span className="tabular-nums text-[var(--muted)]">
                        {slice.costUsd > 0
                          ? formatUsd(slice.costUsd)
                          : formatTokens((slice.inputTokens ?? 0) + (slice.outputTokens ?? 0))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}

function AttributionList({
  rows,
  emptyLabel,
}: {
  rows: UsageAttributionRow[];
  emptyLabel: string;
}) {
  const { t } = useLocale();
  if (rows.length === 0) {
    return <p className="text-[13px] text-[var(--muted)]">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.costUsd), 0.01);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate font-medium text-[var(--ink)]">
              {row.label}
              {row.estimated && row.costUsd > 0 && (
                <span className="ml-1.5 rounded-full bg-[var(--sand-deep)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--muted)]">
                  {t("usage.attribution.estimatedBadge")}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--ink)]">
              {row.costUsd > 0 ? formatUsd(row.costUsd) : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--sand-deep)]">
              <div
                className="h-full rounded-full bg-[var(--clay)] transition-all duration-300"
                style={{ width: `${Math.min(100, (row.costUsd / max) * 100)}%` }}
              />
            </div>
            {row.runCount > 0 && (
              <span className="w-14 shrink-0 text-right text-[11px] text-[var(--muted)]">
                {t("usage.attribution.runs", { count: String(row.runCount) })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CostDecisionsPanel({
  insights,
  onBudgetSaved,
}: {
  insights: UsageCostInsights;
  onBudgetSaved?: () => void;
}) {
  const { t } = useLocale();
  const [attrTab, setAttrTab] = useState<"tool" | "profile" | "flow">("flow");
  const [budgetInput, setBudgetInput] = useState(
    insights.budget.weeklyBudgetUsd != null ? String(insights.budget.weeklyBudgetUsd) : "",
  );
  const [alertAt, setAlertAt] = useState(String(insights.budget.alertAtPercent));
  const [budgetMsg, setBudgetMsg] = useState("");
  const [budgetBusy, setBudgetBusy] = useState(false);

  useEffect(() => {
    setBudgetInput(
      insights.budget.weeklyBudgetUsd != null ? String(insights.budget.weeklyBudgetUsd) : "",
    );
    setAlertAt(String(insights.budget.alertAtPercent));
  }, [insights.budget.weeklyBudgetUsd, insights.budget.alertAtPercent]);

  const alert = insights.alert;
  const alertBg =
    alert.level === "over"
      ? "border-[var(--clay)]/40 bg-[var(--clay)]/10"
      : alert.level === "warn"
        ? "border-[var(--clay)]/25 bg-[var(--sand)]"
        : "border-[var(--sand)] bg-[var(--cream)]/80";

  const hottest = insights.weekHottestFlow;
  const attrRows =
    attrTab === "tool" ? insights.byTool : attrTab === "profile" ? insights.byProfile : insights.byFlow;

  const saveBudget = async (clear = false) => {
    setBudgetBusy(true);
    setBudgetMsg("");
    const weeklyBudgetUsd = clear
      ? null
      : budgetInput.trim() === ""
        ? null
        : Number(budgetInput);
    const alertAtPercent = Number(alertAt);
    const res = await window.api.usageSetBudget({
      weeklyBudgetUsd,
      alertAtPercent: Number.isFinite(alertAtPercent) ? alertAtPercent : 80,
    });
    setBudgetBusy(false);
    if (res.ok) {
      setBudgetMsg(t("usage.budget.saved"));
      onBudgetSaved?.();
    } else {
      setBudgetMsg(res.error ?? t("usage.budget.saveFailed"));
    }
  };

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className={`rounded-[28px] border px-4 py-4 shadow-[var(--shadow-card)] ${alertBg}`}>
        <div className="mb-3 text-[11px] font-medium tracking-wide text-[var(--muted)]">
          {t("usage.decisions.title")}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div>
            <div className="text-[12px] text-[var(--muted)]">{t("usage.decisions.hottest")}</div>
            {hottest ? (
              <>
                <div className="mt-1 truncate text-[17px] font-semibold text-[var(--ink)]">
                  {hottest.label}
                </div>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  {t("usage.decisions.hottestHint", {
                    runs: String(hottest.runCount),
                    cost: formatUsd(hottest.costUsd),
                  })}
                </p>
                {hottest.estimated && hottest.costUsd > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{t("usage.decisions.estimated")}</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                {t("usage.decisions.hottestEmpty")}
              </p>
            )}
          </div>
          <div>
            <div className="text-[12px] text-[var(--muted)]">{t("usage.decisions.weekSpend")}</div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--clay)]">
              {formatUsd(insights.weekSpendUsd)}
            </div>
            <p className="mt-1 text-[13px] text-[var(--ink)]">{t(alert.messageKey)}</p>
            {alert.weeklyBudgetUsd != null && (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--sand-deep)]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      alert.level === "over" ? "bg-[var(--clay-deep)]" : "bg-[var(--clay)]"
                    }`}
                    style={{ width: `${Math.min(100, alert.usedPercent)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                  {t("usage.budget.progress", {
                    spent: formatUsd(alert.weekSpendUsd),
                    budget: formatUsd(alert.weeklyBudgetUsd),
                  })}
                </p>
              </>
            )}
            {alert.weeklyBudgetUsd == null && (
              <p className="mt-1 text-[11px] text-[var(--muted)]">{t("usage.budget.unset")}</p>
            )}
          </div>
        </div>
      </div>

      <Card title={t("usage.attribution.title")}>
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
          {t("usage.attribution.hint")}
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["flow", "usage.attribution.byFlow"],
              ["profile", "usage.attribution.byProfile"],
              ["tool", "usage.attribution.byTool"],
            ] as const
          ).map(([id, key]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAttrTab(id)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] transition-colors duration-200 ${
                attrTab === id
                  ? "bg-[var(--clay)] font-medium text-white shadow-[var(--shadow-accent)]"
                  : "bg-[var(--sand)] text-[var(--ink)] hover:bg-[var(--sand-deep)]"
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <AttributionList rows={attrRows} emptyLabel={t("usage.attribution.empty")} />
      </Card>

      <Card title={t("usage.budget.title")} collapsible defaultCollapsed>
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">{t("usage.budget.hint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[140px] flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--ink)]">{t("usage.budget.amount")}</Label>
            <Input
              type="number"
              min={0}
              step="1"
              placeholder={t("usage.budget.amountPlaceholder")}
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="border-[var(--sand)] bg-[var(--cream)]"
            />
          </div>
          <div className="flex w-[100px] flex-col gap-1.5">
            <Label className="text-[13px] text-[var(--ink)]">{t("usage.budget.alertAt")}</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={alertAt}
              onChange={(e) => setAlertAt(e.target.value)}
              className="border-[var(--sand)] bg-[var(--cream)]"
            />
          </div>
          <Button size="sm" disabled={budgetBusy} onClick={() => void saveBudget(false)}>
            {budgetBusy ? "…" : t("usage.budget.save")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={budgetBusy}
            onClick={() => {
              setBudgetInput("");
              void saveBudget(true);
            }}
          >
            {t("usage.budget.clear")}
          </Button>
        </div>
        {budgetMsg && <p className="mt-2 text-[12px] text-[var(--muted)]">{budgetMsg}</p>}
      </Card>
    </div>
  );
}

function UsageComparisonTable({
  tools,
  onSelectTool,
}: {
  tools: UsageToolSnapshot[];
  onSelectTool: (toolId: UsageToolId) => void;
}) {
  const { t } = useLocale();

  return (
    <Card title={t("usage.compare.title")}>
      <DataTable
        headers={[
          t("usage.compare.tool"),
          t("usage.compare.status"),
          t("usage.table.cost"),
          t("usage.table.input"),
          t("usage.table.output"),
          "",
        ]}
      >
        {tools.map((snap) => (
          <tr key={snap.toolId} className="group">
            <Td>
              <div className="flex items-center gap-2">
                <UsageToolHeader toolId={snap.toolId} />
              </div>
            </Td>
            <Td className="max-w-[180px] truncate text-[12px] text-[var(--muted)]">
              {statusLabel(snap, t)}
            </Td>
            <Td className="tabular-nums">
              {snap.status === "ok" ? formatUsd(snap.totalCostUsd ?? 0) : "—"}
            </Td>
            <Td className="tabular-nums">
              {snap.status === "ok" ? formatTokens(snap.totalInputTokens) : "—"}
            </Td>
            <Td className="tabular-nums">
              {snap.status === "ok" ? formatTokens(snap.totalOutputTokens) : "—"}
            </Td>
            <Td>
              <button
                type="button"
                onClick={() => onSelectTool(snap.toolId)}
                className="cursor-pointer rounded-full px-2.5 py-1 text-[12px] text-[var(--clay)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-[var(--sand)]"
              >
                {t("usage.compare.view")}
              </button>
            </Td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}

export function UsageTab() {
  const { t } = useLocale();
  const [providers, setProviders] = useState<UsageProviderMeta[]>([]);
  const [statuses, setStatuses] = useState<UsageCredentialStatus[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [dashboard, setDashboard] = useState<UsageDashboardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [scope, setScope] = useState<UsageScope>("all");

  const refreshMeta = useCallback(async () => {
    const [prov, stat] = await Promise.all([
      window.api.usageGetProviders(),
      window.api.usageGetCredentialStatus(),
    ]);
    setProviders(prov.providers);
    setEncryptionAvailable(prov.encryptionAvailable);
    setStatuses(stat.statuses);
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await window.api.usageFetchDashboard({ days: rangeDays });
    setLoading(false);
    if (res.ok) setDashboard(res.dashboard);
    else setError(res.error ?? t("usage.fetchFailed"));
  }, [rangeDays, t]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const statusMap = useMemo(
    () => new Map(statuses.map((s) => [s.toolId, s])),
    [statuses],
  );

  const providerMap = useMemo(
    () => new Map(providers.map((p) => [p.toolId, p])),
    [providers],
  );

  const tools = dashboard?.tools ?? [];
  const activeToolIds = useMemo(
    () => tools.filter((snap) => snap.status === "ok").map((snap) => snap.toolId),
    [tools],
  );
  const supportedSnapshots = tools.filter((snap) => snap.status === "ok");
  const quotaOnlyToolIds = useMemo(
    () =>
      tools
        .filter((snap) => snap.status === "ok" && snap.daily.length === 0)
        .map((snap) => snap.toolId),
    [tools],
  );
  const activeSnapshot = scope === "all" ? null : tools.find((snap) => snap.toolId === scope);
  const activeProvider = scope === "all" ? null : providerMap.get(scope);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--ink)]">{t("usage.title")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">{t("usage.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            className="cursor-pointer rounded-[22px] border border-[var(--sand)] bg-[var(--cream)] px-3 py-1.5 text-[13px] text-[var(--ink)]"
          >
            <option value={7}>{t("usage.range.7d")}</option>
            <option value={14}>{t("usage.range.14d")}</option>
            <option value={30}>{t("usage.range.30d")}</option>
            <option value={90}>{t("usage.range.90d")}</option>
          </select>
          <Button size="sm" variant="outline" disabled={loading} onClick={fetchDashboard}>
            {loading ? "…" : t("usage.refresh")}
          </Button>
        </div>
      </div>

      {!encryptionAvailable && (
        <div className="mb-4 rounded-[22px] border border-[var(--clay)]/30 bg-[var(--sand)] px-4 py-3 text-[13px] text-[var(--ink)]">
          {t("usage.encryptionUnavailable")}
        </div>
      )}

      {dashboard && tools.length > 0 && (
        <UsageToolNav scope={scope} tools={tools} onSelect={setScope} />
      )}

      {scope === "all" && dashboard && (
        <>
          {dashboard.insights && (
            <CostDecisionsPanel
              insights={dashboard.insights}
              onBudgetSaved={() => void fetchDashboard()}
            />
          )}

          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <StatCard
              value={formatUsd(dashboard.summary.totalCostUsd)}
              label={t("usage.summary.totalCost")}
              valueClassName="text-[var(--clay)]"
            />
            <StatCard
              value={formatTokens(dashboard.summary.totalInputTokens)}
              label={t("usage.summary.totalInputTokens")}
            />
            <StatCard
              value={formatTokens(dashboard.summary.totalOutputTokens)}
              label={t("usage.summary.totalOutputTokens")}
            />
            <StatCard
              value={`${dashboard.summary.configuredCount}/${providers.length}`}
              label={t("usage.summary.configured")}
            />
            <StatCard
              value={supportedSnapshots.length}
              label={t("usage.summary.active")}
            />
          </div>

          <UsageUnifiedDaily
            rows={dashboard.summary.dailyUnified}
            activeToolIds={activeToolIds}
            quotaOnlyToolIds={quotaOnlyToolIds}
            onSelectTool={(id) => setScope(id)}
          />

          <UsageComparisonTable tools={tools} onSelectTool={(id) => setScope(id)} />

          <Card title={t("usage.credentials.title")} collapsible defaultCollapsed>
            <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">{t("usage.credentials.hint")}</p>
            <div className="flex flex-col gap-3">
              {providers.map((provider) => (
                <ToolCredentialRow
                  key={provider.toolId}
                  provider={provider}
                  status={statusMap.get(provider.toolId)}
                  encryptionAvailable={encryptionAvailable}
                  onSaved={() => {
                    void refreshMeta();
                    void fetchDashboard();
                  }}
                />
              ))}
            </div>
          </Card>
        </>
      )}

      {scope !== "all" && activeSnapshot && activeProvider && (
        <>
          <Card
            title={
              <div className="flex flex-wrap items-center gap-2">
                <UsageToolHeader toolId={scope} />
                {activeSnapshot.authSourceKey && activeSnapshot.status === "ok" && (
                  <span className="rounded-full bg-[var(--sand)] px-2.5 py-0.5 text-[11px] text-[var(--ink)]">
                    {t(activeSnapshot.authSourceKey as MessageKey)}
                  </span>
                )}
              </div>
            }
          >
            <ToolUsageDetail snapshot={activeSnapshot} />
          </Card>

          <Card title={t("usage.credentials.title")}>
            <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">{t("usage.credentials.hint")}</p>
            <ToolCredentialRow
              provider={activeProvider}
              status={statusMap.get(scope)}
              encryptionAvailable={encryptionAvailable}
              onSaved={() => {
                void refreshMeta();
                void fetchDashboard();
              }}
            />
          </Card>
        </>
      )}

      {loading && !dashboard && (
        <div className="py-10">
          <Spinner label={t("usage.loading")} />
        </div>
      )}

      {error && <EmptyState title={t("usage.fetchFailed")} description={error} />}

      {dashboard && (
        <p className="mt-4 text-[11px] text-[var(--muted)]">
          {t("usage.fetchedAt", {
            time: new Date(dashboard.fetchedAt).toLocaleString(),
            days: String(dashboard.rangeDays),
          })}
        </p>
      )}
    </>
  );
}
