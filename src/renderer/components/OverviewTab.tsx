import { useEffect, useRef, useState } from "react";
import type { EnvVarGroup, ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { AuthBadgeForEntry, Badge, YesNo } from "./Badge";
import { Tag } from "./Tag";
import { ToolNameCell } from "./ToolNameCell";
import { EmptyInventoryHint } from "./InventorySection";
import { toolLabel, toolInstall, formatContext } from "../utils";
import { partitionByInstalled, sortByInstalled, installedRowClass } from "../utils/inventory-display";

export function OverviewTab({ data, modelOverrides = {} }: { data: ProviderEntry[]; modelOverrides?: Record<string, string> }) {
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

  return (
    <>
      {/* Summary grid */}
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <SummaryBox value={`${available}/${data.length}`} label="已安裝 / 偵測總數" />
        <SummaryBox value={notInstalled.length} label="未安裝" className={notInstalled.length > 0 ? "text-text-tertiary" : "text-ok"} />
        <SummaryBox value={totalMcp} label="MCP Servers" />
        <SummaryBox
          value={warnings}
          label="Warnings"
          className={warnings > 0 ? "text-warn" : "text-ok"}
        />
      </div>

      <EmptyInventoryHint entries={data} />

      <Card>
        <DataTable headers={["Tool", "Version", "Auth", "MCP", "Model", "Context", "Stream", "Tools", "Skills"]}>
          {sorted.map((e) => (
            <tr key={e.tool} className={installedRowClass(e.available)}>
              <Td>
                <ToolNameCell entry={e} />
              </Td>
              <Td>
                <span className="text-text-secondary">{e.available ? (e.version ?? "—") : "—"}</span>
              </Td>
              <Td><AuthBadgeForEntry entry={e} /></Td>
              <Td>
                {!e.available ? (
                  <span className="text-text-tertiary">—</span>
                ) : e.mcp.supported ? (
                  <Badge text="Yes" variant="ok" />
                ) : (
                  <Badge text="No" variant="fail" />
                )}
              </Td>
              <Td>{e.available ? (modelOverrides[e.tool] ?? e.model ?? "default") : "—"}</Td>
              <Td>{e.available ? formatContext(e.capabilities.contextTokens) : "—"}</Td>
              <Td>{e.available ? <YesNo value={e.capabilities.streaming} /> : <span className="text-text-tertiary">—</span>}</Td>
              <Td>{e.available ? <YesNo value={e.capabilities.toolCalls} /> : <span className="text-text-tertiary">—</span>}</Td>
              <Td>
                {e.available ? (
                  <div className="flex flex-wrap gap-1.5">
                    {e.skills.map((s) => <Tag key={s}>{s}</Tag>)}
                  </div>
                ) : (
                  <span className="text-text-tertiary">—</span>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {/* Warnings */}
      {warnings > 0 && (
        <Card title="⚠️ Warnings">
          {data
            .filter((e) => !e.available || (e.available && e.auth === "missing"))
            .map((w) => (
              <div key={w.tool} className="border-t border-border py-2 first:border-none first:pt-0">
                {!w.available && (
                  <InstallPrompt tool={w.tool} />
                )}
                {w.available && w.auth === "missing" && (
                  <div className="flex items-center gap-2 py-1 text-[13px]">
                    <span className="w-5 text-center">✗</span>
                    <strong>{toolLabel(w.tool)}</strong>: auth not configured
                  </div>
                )}
              </div>
            ))}
        </Card>
      )}
      {/* Environment Variables */}
      {envGroups.length > 0 && (
        <Card title="🔑 Environment">
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
                        title={canReveal ? (isOpen ? "隱藏值" : "點擊查看值") : v.set ? "已設定（無可顯示的值）" : "未設定"}
                      >
                        {v.key}
                      </button>
                      {canReveal && isOpen && (
                        <div
                          role="tooltip"
                          className="absolute top-full left-0 z-20 mt-1 w-max max-w-[95vw] overflow-x-auto whitespace-nowrap rounded-md border border-border bg-bg-primary px-3 py-2 font-mono text-[12px] text-accent shadow-lg select-all"
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
    </>
  );
}

function SummaryBox({
  value,
  label,
  className = "text-accent",
}: {
  value: number | string;
  label: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4 text-center">
      <div className={`text-[28px] font-bold ${className}`}>{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{label}</div>
    </div>
  );
}

function InstallPrompt({ tool }: { tool: string }) {
  const [copied, setCopied] = useState(false);
  const info = toolInstall(tool);

  const copy = () => {
    if (!info) return;
    navigator.clipboard.writeText(info.cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-[13px]">
      <div className="flex items-center gap-2 py-1">
        <span className="w-5 text-center">✗</span>
        <strong>{toolLabel(tool)}</strong>: not found in PATH
        {info?.url && (
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-accent underline-offset-2 hover:underline"
          >
            官網
          </a>
        )}
      </div>
      {info && (
        <div className="ml-7 mt-1 flex items-center gap-2">
          <span className="text-text-secondary text-[11px]">安裝：</span>
          <code className="flex-1 rounded bg-bg-secondary px-2 py-1 font-mono text-[11px] text-text-primary">
            {info.cmd}
          </code>
          <button
            onClick={copy}
            className="cursor-pointer rounded border border-border px-2 py-1 text-[11px] text-text-secondary transition-all hover:border-accent hover:text-accent"
          >
            {copied ? "✓ 已複製" : "複製"}
          </button>
        </div>
      )}
    </div>
  );
}
