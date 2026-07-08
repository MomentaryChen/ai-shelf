import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  KeyRound,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EnvVarGroup, HealthMonitorState, ProviderEntry } from "../types";
import { Card } from "./Card";
import { StatCard } from "./StatCard";
import { HealthStatusBanner } from "./HealthStatusBanner";
import { DataTable, Td } from "./DataTable";
import { AuthBadgeForEntry, YesNo } from "./Badge";
import { Tag } from "./Tag";
import { EmptyState } from "./EmptyState";
import { ToolNameCell } from "./ToolNameCell";
import { EmptyInventoryHint } from "./InventorySection";
import { toolLabel, toolInstall, formatContext } from "../utils";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { partitionByInstalled, sortByInstalled, installedRowClass } from "../utils/inventory-display";
import { useLocale } from "../i18n/LocaleProvider";

type ToolFilter = "all" | "installed" | "notInstalled";
type SortKey = "default" | "tool" | "context";

export function OverviewTab({
  data,
  modelOverrides = {},
  healthState,
  onGoDoctor,
  onGoUpdate,
  onRefreshHealth,
}: {
  data: ProviderEntry[];
  modelOverrides?: Record<string, string>;
  healthState?: HealthMonitorState | null;
  onGoDoctor?: () => void;
  onGoUpdate?: () => void;
  onRefreshHealth?: () => void;
}) {
  const { t } = useLocale();
  const sorted = sortByInstalled(data);
  const { installed, notInstalled } = partitionByInstalled(data);
  const available = installed.length;
  const totalMcp = new Set(data.flatMap((e) => e.mcp.servers)).size;
  const totalSkills = new Set(data.flatMap((e) => e.skills)).size;
  const warnings = data.filter((e) => !e.available || (e.available && e.auth === "missing")).length;

  const [envGroups, setEnvGroups] = useState<EnvVarGroup[]>([]);
  const [openEnvId, setOpenEnvId] = useState<string | null>(null);
  const envPopoverRef = useRef<HTMLSpanElement>(null);
  useEffect(() => { window.api.getEnvVars().then(setEnvGroups); }, []);

  useEffect(() => {
    if (!openEnvId) return;
    const close = (e: MouseEvent) => {
      if (envPopoverRef.current?.contains(e.target as Node)) return;
      setOpenEnvId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openEnvId]);

  const envKey = (provider: string, key: string) => `${provider}:${key}`;

  // --- Table toolbar: search + filter + sort -------------------------------
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ToolFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => {
    let list = sortByInstalled(data);
    if (filter === "installed") list = list.filter((e) => e.available);
    else if (filter === "notInstalled") list = list.filter((e) => !e.available);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => `${toolLabel(e.tool)} ${e.tool}`.toLowerCase().includes(q));
    if (sortKey === "tool") {
      list = [...list].sort(
        (a, b) => toolLabel(a.tool).localeCompare(toolLabel(b.tool)) * (sortAsc ? 1 : -1),
      );
    } else if (sortKey === "context") {
      list = [...list].sort(
        (a, b) =>
          ((a.capabilities.contextTokens ?? 0) - (b.capabilities.contextTokens ?? 0)) *
          (sortAsc ? 1 : -1),
      );
    }
    return list;
  }, [data, filter, query, sortKey, sortAsc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-text-secondary"
    >
      {label}
      <span aria-hidden className="opacity-70">
        {sortKey === k ? (
          sortAsc ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3" />
        )}
      </span>
    </button>
  );

  const FILTERS: { id: ToolFilter; label: string }[] = [
    { id: "all", label: t("inventory.filter.all") },
    { id: "installed", label: t("inventory.filter.installed") },
    { id: "notInstalled", label: t("inventory.filter.notInstalled") },
  ];

  return (
    <>
      {healthState && onGoDoctor && onGoUpdate && onRefreshHealth && (
        <HealthStatusBanner
          state={healthState}
          onGoDoctor={onGoDoctor}
          onGoUpdate={onGoUpdate}
          onRefresh={onRefreshHealth}
        />
      )}

      {/* Summary grid */}
      <div className="ui-stagger-children mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <StatCard value={`${available}/${data.length}`} label={t("inventory.overview.available")} />
        <StatCard value={notInstalled.length} label={t("inventory.notInstalled")} valueClassName={notInstalled.length > 0 ? "text-text-tertiary" : "text-ok"} />
        <StatCard value={totalMcp} label={t("inventory.overview.mcpServers")} />
        <StatCard
          value={warnings}
          label={t("inventory.overview.warnings")}
          valueClassName={warnings > 0 ? "text-warn" : "text-ok"}
        />
      </div>

      <EmptyInventoryHint entries={data} />

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 z-10 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inventory.search.placeholder")}
            className="border-border bg-bg-secondary py-1.5 pr-3 pl-8 text-[13px] placeholder:text-text-tertiary focus-visible:border-accent"
          />
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            if (value) setFilter(value as ToolFilter);
          }}
          className="gap-0.5 rounded-md bg-bg-secondary p-0.5"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.id} value={f.id} size="compact" className="border-transparent data-[state=off]:border-transparent data-[state=off]:hover:border-transparent">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Search aria-hidden className="h-9 w-9 text-text-tertiary" />} title={t("inventory.search.noMatch")} />
        ) : (
          <DataTable
            headers={[
              <SortHeader key="tool" label="Tool" k="tool" />,
              "Version",
              "Auth",
              "MCP",
              "Model",
              <SortHeader key="ctx" label="Context" k="context" />,
              "Stream",
              "Tools",
              "Skills",
            ]}
          >
            {rows.map((e) => (
            <tr key={e.tool} className={installedRowClass(e.available)}>
              <Td>
                <ToolNameCell entry={e} />
              </Td>
              <Td>
                <span
                  title={e.available ? (e.version ?? undefined) : undefined}
                  className="inline-block max-w-[13ch] truncate whitespace-nowrap align-bottom text-text-secondary"
                >
                  {e.available ? (e.version ?? "—") : "—"}
                </span>
              </Td>
              <Td><AuthBadgeForEntry entry={e} /></Td>
              <Td>
                {!e.available ? (
                  <span className="text-text-tertiary">—</span>
                ) : (
                  <YesNo value={e.mcp.supported} />
                )}
              </Td>
              <Td>{e.available ? (modelOverrides[e.tool] ?? e.model ?? "default") : "—"}</Td>
              <Td>{e.available ? formatContext(e.capabilities.contextTokens) : "—"}</Td>
              <Td>{e.available ? <YesNo value={e.capabilities.streaming} /> : <span className="text-text-tertiary">—</span>}</Td>
              <Td>{e.available ? <YesNo value={e.capabilities.toolCalls} /> : <span className="text-text-tertiary">—</span>}</Td>
              <Td>
                {e.available ? (
                  e.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {e.skills.map((s) => <Tag key={s}>{s}</Tag>)}
                    </div>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
              </Td>
            </tr>
          ))}
          </DataTable>
        )}
      </Card>

      {/* Warnings + Environment — side by side on wide screens */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start [&>*]:mb-0 [&>*]:min-w-0 [&>*]:flex-1">
      {warnings > 0 && (
        <Card
          title={
            <>
              <AlertTriangle aria-hidden className="h-4 w-4 text-warn" />
              {t("inventory.overview.cardWarnings")}
            </>
          }
        >
          {data
            .filter((e) => !e.available || (e.available && e.auth === "missing"))
            .map((w) => (
              <div key={w.tool} className="border-t border-border py-2 first:border-none first:pt-0">
                {!w.available && (
                  <InstallPrompt tool={w.tool} />
                )}
                {w.available && w.auth === "missing" && (
                  <div className="flex items-center gap-2 py-1 text-[13px]">
                    <span className="flex w-5 justify-center">
                      <X aria-hidden className="h-3.5 w-3.5 text-fail" />
                    </span>
                    <strong>{toolLabel(w.tool)}</strong>: {t("inventory.overview.authNotConfigured")}
                  </div>
                )}
              </div>
            ))}
        </Card>
      )}
      {/* Environment Variables */}
      {envGroups.length > 0 && (
        <Card
          title={
            <>
              <KeyRound aria-hidden className="h-4 w-4 text-text-secondary" />
              {t("inventory.overview.cardEnvironment")}
            </>
          }
        >
          {envGroups.map((group) => (
            <div key={group.provider} className="flex items-start gap-4 border-t border-border py-2.5 first:border-none first:pt-0 text-[13px]">
              <span className="w-20 shrink-0 font-medium text-text-primary">{group.provider}</span>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {group.vars.map((v) => {
                  const id = envKey(group.provider, v.key);
                  const isOpen = openEnvId === id;
                  const canReveal = v.set && !!v.value;
                  return (
                    <span
                      key={v.key}
                      ref={isOpen ? envPopoverRef : undefined}
                      className="relative inline-flex items-center gap-1.5"
                    >
                      <span className={v.set ? "text-ok" : "text-warn"}>{v.set ? "●" : "○"}</span>
                      <button
                        type="button"
                        disabled={!canReveal}
                        onClick={() => setOpenEnvId(isOpen ? null : id)}
                        className={`text-left text-text-secondary transition-colors ${
                          canReveal
                            ? "cursor-pointer hover:text-accent"
                            : "cursor-default opacity-80"
                        }`}
                        title={
                          canReveal
                            ? isOpen
                              ? t("inventory.overview.hideValue")
                              : t("inventory.overview.revealValue")
                            : v.set
                              ? t("inventory.overview.setNoValue")
                              : t("inventory.overview.notSet")
                        }
                      >
                        {v.key}
                      </button>
                      {canReveal && isOpen && (
                        <div
                          role="tooltip"
                          className="absolute top-full left-0 z-20 mt-1 w-max max-w-[95vw] overflow-x-auto whitespace-nowrap rounded-md border border-border bg-bg-primary px-3 py-2 font-mono text-[12px] text-accent shadow-pop select-all"
                        >
                          {v.value}
                        </div>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      )}
      </div>
    </>
  );
}

function InstallPrompt({ tool }: { tool: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const info = toolInstall(tool);

  const copy = async () => {
    if (!info) return;
    const ok = await writeClipboardText(info.cmd);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-2 py-1">
        <span className="flex w-5 justify-center">
          <X aria-hidden className="h-3.5 w-3.5 text-fail" />
        </span>
        <strong>{toolLabel(tool)}</strong>: {t("inventory.overview.notInPath")}
        {info?.url && (
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-accent underline-offset-2 hover:underline"
          >
            {t("inventory.overview.website")}
          </a>
        )}
      </div>
      {info && (
        <div className="ml-7 mt-1 flex items-center gap-2">
          <span className="text-text-secondary text-[11px]">{t("inventory.overview.install")}</span>
          <code className="flex-1 rounded bg-bg-secondary px-2 py-1 font-mono text-[11px] text-text-primary">
            {info.cmd}
          </code>
          <button
            onClick={copy}
            className="cursor-pointer rounded border border-border px-2 py-1 text-[11px] text-text-secondary transition-all hover:border-accent hover:text-accent"
          >
            {copied ? t("inventory.overview.copied") : t("inventory.overview.copy")}
          </button>
        </div>
      )}
    </div>
  );
}
