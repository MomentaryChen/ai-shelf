import { useEffect, useState } from "react";
import type { EnvVarGroup, ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { AuthBadge, Badge, YesNo } from "./Badge";
import { Tag } from "./Tag";
import { toolIcon, toolLabel, toolInstall, formatContext } from "../utils";

export function OverviewTab({ data, modelOverrides = {} }: { data: ProviderEntry[]; modelOverrides?: Record<string, string> }) {
  const available = data.filter((e) => e.available).length;
  const totalMcp = new Set(data.flatMap((e) => e.mcp.servers)).size;
  const totalSkills = new Set(data.flatMap((e) => e.skills)).size;
  const warnings = data.filter((e) => !e.available || e.auth === "missing").length;

  const [envGroups, setEnvGroups] = useState<EnvVarGroup[]>([]);
  useEffect(() => { window.api.getEnvVars().then(setEnvGroups); }, []);

  return (
    <>
      {/* Summary grid */}
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <SummaryBox value={data.length} label="AI Tools Detected" />
        <SummaryBox value={available} label="Available" />
        <SummaryBox value={totalMcp} label="MCP Servers" />
        <SummaryBox
          value={warnings}
          label="Warnings"
          className={warnings > 0 ? "text-warn" : "text-ok"}
        />
      </div>

      {/* Main table */}
      <Card>
        <DataTable headers={["Tool", "Version", "Auth", "MCP", "Model", "Context", "Stream", "Tools", "Skills"]}>
          {data.map((e) => (
            <tr key={e.tool}>
              <Td>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span>{toolIcon(e.tool)}</span>
                  <strong>{toolLabel(e.tool)}</strong>
                  {!e.available && <span className="text-fail text-[12px]">(not found)</span>}
                </div>
              </Td>
              <Td><span className="text-text-secondary">{e.version ?? "—"}</span></Td>
              <Td><AuthBadge auth={e.auth} /></Td>
              <Td>{e.mcp.supported ? <Badge text="Yes" variant="ok" /> : <Badge text="No" variant="fail" />}</Td>
              <Td>{modelOverrides[e.tool] ?? e.model ?? "default"}</Td>
              <Td>{formatContext(e.capabilities.contextTokens)}</Td>
              <Td><YesNo value={e.capabilities.streaming} /></Td>
              <Td><YesNo value={e.capabilities.toolCalls} /></Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  {e.skills.map((s) => <Tag key={s}>{s}</Tag>)}
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {/* Warnings */}
      {warnings > 0 && (
        <Card title="⚠️ Warnings">
          {data
            .filter((e) => !e.available || e.auth === "missing")
            .map((w) => (
              <div key={w.tool} className="border-t border-border py-2 first:border-none first:pt-0">
                {!w.available && (
                  <InstallPrompt tool={w.tool} />
                )}
                {w.auth === "missing" && (
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
                {group.vars.map((v) => (
                  <span key={v.key} className="flex items-center gap-1.5">
                    <span className={v.set ? "text-ok" : "text-warn"}>{v.set ? "●" : "○"}</span>
                    <span className="text-text-secondary">{v.key}</span>
                    {v.value && (
                      <span className="text-[12px] text-accent blur-sm transition-[filter] duration-150 hover:blur-none cursor-default select-none hover:select-text">
                        {v.value}
                      </span>
                    )}
                  </span>
                ))}
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
  value: number;
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
