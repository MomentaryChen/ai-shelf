import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Tag } from "./Tag";
import { McpSyncPanel } from "./McpSyncPanel";
import { toolIcon, toolLabel } from "../utils";

export function McpTab({ data }: { data: ProviderEntry[] }) {
  const allServers = [...new Set(data.flatMap((e) => e.mcp.servers))];

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🔌 MCP Servers</h2>

      {allServers.length > 0 && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div className="rounded-lg border border-border bg-bg-secondary p-4 text-center">
            <div className="text-[28px] font-bold text-accent">{allServers.length}</div>
            <div className="mt-1 text-xs text-text-secondary">Unique MCP Servers</div>
          </div>
        </div>
      )}

      {data.map((e) => (
        <Card
          key={e.tool}
          title={<>{toolIcon(e.tool)} {toolLabel(e.tool)}</>}
          trailing={
            e.mcp.supported
              ? <Badge text="Supported" variant="ok" />
              : <Badge text="Not Supported" variant="fail" />
          }
        >
          {e.mcp.servers.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {e.mcp.servers.map((s) => <Tag key={s}>🔌 {s}</Tag>)}
            </div>
          ) : e.mcp.supported ? (
            <p className="mb-3 text-text-secondary">(none configured)</p>
          ) : null}

          {e.mcp.configPaths.length > 0 && (
            <div className="mt-2">
              {e.mcp.configPaths.map((p) => (
                <div key={p} className="mb-1">
                  <span
                    className="break-all rounded bg-accent/8 px-1.5 py-0.5 font-mono text-xs text-accent cursor-pointer hover:bg-accent/20 hover:underline"
                    title="Click to open"
                    onClick={() => window.api.openPath(p)}
                  >
                    {p}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {/* Unified matrix + sync */}
      <McpSyncPanel />
    </>
  );
}
