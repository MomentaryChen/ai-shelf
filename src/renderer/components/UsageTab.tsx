import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  UsageCredentialStatus,
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
      <strong className="text-text-primary">{toolLabel(id)}</strong>
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
            ? "bg-accent font-medium text-on-accent warm-shadow-accent"
            : "bg-secondary text-text-primary hover:bg-accent-surface"
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
                ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                : "bg-secondary text-text-primary hover:bg-accent-surface"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">{toolIcon(snap.toolId)}</span>
            <span>{toolLabel(snap.toolId)}</span>
            {snap.status === "ok" && cost > 0 && (
              <span
                className={`tabular-nums text-[11px] ${active ? "text-on-accent/85" : "text-text-secondary"}`}
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
    <div className="rounded-[22px] border border-border bg-bg-primary/60 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <UsageToolHeader toolId={provider.toolId} />
          {provider.supported ? (
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] text-ok">
              {t("usage.badge.api")}
            </span>
          ) : (
            <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[11px] text-text-secondary">
              {t("usage.badge.comingSoon")}
            </span>
          )}
        </div>
        {status?.configured && status.maskedHint && (
          <span className="font-mono text-[11px] text-text-secondary">{status.maskedHint}</span>
        )}
      </div>

      {provider.unsupportedReason && (
        <p className="mb-3 text-[13px] leading-relaxed text-text-secondary">{provider.unsupportedReason}</p>
      )}

      {provider.credentialNoteKey && (
        <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
          {t(provider.credentialNoteKey as MessageKey)}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {fieldGroups.map(([groupKey, fields]) => {
          const groupLabelKey = fields[0]?.groupLabelKey;
          return (
            <div
              key={groupKey}
              className="rounded-[18px] border border-border/80 bg-bg-secondary/40 p-3.5"
            >
              {groupLabelKey && (
                <div className="mb-2 text-[13px] font-medium text-text-primary">
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
                      <p className="text-[12px] leading-relaxed text-text-secondary">
                        {t(field.noteKey as MessageKey)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-[13px] text-text-primary">{label}</Label>
                      {configured && fieldMaskedHint(field.key) && (
                        <span className="font-mono text-[11px] text-text-secondary">
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
                      className="border-border bg-bg-primary"
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
                          className="cursor-pointer text-[12px] text-accent underline-offset-2 hover:underline"
                          onClick={() => window.api.openExternal(field.helpUrl!)}
                        >
                          {field.helpLinkKey
                            ? t(field.helpLinkKey as MessageKey)
                            : t("usage.credential.howToGet")}
                        </button>
                      )}
                    </div>
                    {messages[field.key] && (
                      <p className="text-[12px] text-text-secondary">{messages[field.key]}</p>
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

function ToolUsageDetail({ snapshot }: { snapshot: UsageToolSnapshot }) {
  const { t } = useLocale();

  if (snapshot.status === "unsupported") {
    return (
      <p className="text-[13px] text-text-secondary">{snapshot.error ?? t("usage.tool.unsupported")}</p>
    );
  }

  if (snapshot.status === "not_configured") {
    return <p className="text-[13px] text-text-secondary">{t("usage.tool.notConfigured")}</p>;
  }

  if (snapshot.status === "error") {
    return <p className="text-[13px] text-fail">{snapshot.error}</p>;
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
          <p className="mb-3 text-[13px] leading-relaxed text-text-secondary">
            {t(quotaHintKey as MessageKey)}
          </p>
          <div className="flex flex-col gap-2.5">
            {snapshot.quotas.map((q) => (
              <div key={q.key} className="rounded-[16px] bg-secondary/50 px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text-primary">
                    {q.label ?? t(q.labelKey as MessageKey)}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-accent">
                    {q.usedPercent}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-accent-surface">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.min(100, q.usedPercent)}%` }}
                  />
                </div>
                {q.remainingUsd != null && q.limitUsd != null && (
                  <p className="mt-1.5 text-[11px] text-text-secondary">
                    {t("usage.cursor.quota.remaining", {
                      remaining: formatUsd(q.remainingUsd),
                      limit: formatUsd(q.limitUsd),
                    })}
                  </p>
                )}
                {q.resetAt && (
                  <p className="mt-1.5 text-[11px] text-text-secondary">
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
          <div className="rounded-[16px] bg-secondary/50 px-3 py-2">
            <div className="text-[10px] text-text-secondary">{t("usage.table.cost")}</div>
            <div className="text-[18px] font-medium tabular-nums text-accent">
              {formatUsd(snapshot.totalCostUsd ?? 0)}
            </div>
          </div>
          {!quotaMode && (
            <>
              <div className="rounded-[16px] bg-secondary/50 px-3 py-2">
                <div className="text-[10px] text-text-secondary">{t("usage.metric.inputTokens")}</div>
                <div className="text-[18px] font-medium tabular-nums">
                  {formatTokens(snapshot.totalInputTokens)}
                </div>
              </div>
              <div className="rounded-[16px] bg-secondary/50 px-3 py-2">
                <div className="text-[10px] text-text-secondary">{t("usage.metric.outputTokens")}</div>
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
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-text-secondary">
            {t("usage.byModel")}
          </div>
          <div className="flex flex-col gap-1">
            {snapshot.byModel.slice(0, 12).map((m) => (
              <div key={m.model} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate font-mono">{m.model}</span>
                <span className="shrink-0 tabular-nums text-text-primary">
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
            <Td className="max-w-[180px] truncate text-[12px] text-text-secondary">
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
                className="cursor-pointer rounded-full px-2.5 py-1 text-[12px] text-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-secondary"
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
  const supportedSnapshots = tools.filter((snap) => snap.status === "ok");
  const activeSnapshot = scope === "all" ? null : tools.find((snap) => snap.toolId === scope);
  const activeProvider = scope === "all" ? null : providerMap.get(scope);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-text-primary">{t("usage.title")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-text-secondary">{t("usage.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            className="cursor-pointer rounded-[22px] border border-border bg-bg-primary px-3 py-1.5 text-[13px] text-text-primary"
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
        <div className="mb-4 rounded-[22px] border border-accent/30 bg-secondary px-4 py-3 text-[13px] text-text-primary">
          {t("usage.encryptionUnavailable")}
        </div>
      )}

      {dashboard && tools.length > 0 && (
        <UsageToolNav scope={scope} tools={tools} onSelect={setScope} />
      )}

      {scope === "all" && dashboard && (
        <>
          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <StatCard
              value={formatUsd(dashboard.summary.totalCostUsd)}
              label={t("usage.summary.totalCost")}
              valueClassName="text-accent"
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

          <UsageComparisonTable tools={tools} onSelectTool={(id) => setScope(id)} />

          <Card title={t("usage.credentials.title")} collapsible defaultCollapsed>
            <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">{t("usage.credentials.hint")}</p>
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
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] text-text-primary">
                    {t(activeSnapshot.authSourceKey as MessageKey)}
                  </span>
                )}
              </div>
            }
          >
            <ToolUsageDetail snapshot={activeSnapshot} />
          </Card>

          <Card title={t("usage.credentials.title")}>
            <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">{t("usage.credentials.hint")}</p>
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
        <p className="mt-4 text-[11px] text-text-secondary">
          {t("usage.fetchedAt", {
            time: new Date(dashboard.fetchedAt).toLocaleString(),
            days: String(dashboard.rangeDays),
          })}
        </p>
      )}
    </>
  );
}
