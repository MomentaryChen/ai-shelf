import { useState } from "react";
import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { YesNo } from "./Badge";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { formatContext, toolInstall } from "../utils";
import { partitionByInstalled, installedRowClass } from "../utils/inventory-display";

function ModelChip({ name, active }: { name: string; active?: boolean }) {
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap ${
        active ? "bg-accent/20 font-semibold text-accent ring-2 ring-accent" : "bg-surface-2 text-muted"
      }`}
    >
      {name}
    </span>
  );
}

function ModelsTable({
  entries,
  expanded,
  toggleExpand,
}: {
  entries: ProviderEntry[];
  expanded: Set<string>;
  toggleExpand: (tool: string) => void;
}) {
  const LIMIT = 10;

  if (entries.length === 0) return null;

  return (
    <Card>
      <DataTable headers={["Tool", "Available Models", "Context", "Streaming", "Tool Calls", "Vision"]}>
        {entries.map((e) => (
          <tr key={e.tool} className={installedRowClass(e.available)}>
            <Td>
              <ToolNameCell entry={e} />
            </Td>
            <Td>
              {(() => {
                if (!e.available) {
                  const install = toolInstall(e.tool);
                  return (
                    <div className="text-[11px] text-text-tertiary">
                      {e.model ? (
                        <span>
                          僅設定檔：<span className="font-mono text-text-secondary">{e.model}</span>
                        </span>
                      ) : (
                        <span>請先安裝 CLI 後才能使用模型</span>
                      )}
                      {install && (
                        <code className="mt-1 block truncate rounded bg-bg-primary px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                          {install.cmd}
                        </code>
                      )}
                    </div>
                  );
                }
                const all = e.models && e.models.length > 0 ? e.models : [e.model ?? "default"];
                const isExpanded = expanded.has(e.tool);
                const visible = isExpanded ? all : all.slice(0, LIMIT);
                const hidden = all.length - LIMIT;
                const activeModel = e.model;
                return (
                  <div className="flex flex-wrap gap-1">
                    {visible.map((m) => (
                      <ModelChip key={m} name={m} active={m === activeModel} />
                    ))}
                    {all.length > LIMIT && (
                      <button
                        onClick={() => toggleExpand(e.tool)}
                        className="cursor-pointer rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-secondary transition-all hover:border-accent hover:text-accent"
                      >
                        {isExpanded ? "Show less" : `+${hidden} more`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </Td>
            <Td>{e.available ? formatContext(e.capabilities.contextTokens) : "—"}</Td>
            <Td>{e.available ? <YesNo value={e.capabilities.streaming} /> : <span className="text-text-tertiary">—</span>}</Td>
            <Td>{e.available ? <YesNo value={e.capabilities.toolCalls} /> : <span className="text-text-tertiary">—</span>}</Td>
            <Td>{e.available ? <YesNo value={e.capabilities.vision} /> : <span className="text-text-tertiary">—</span>}</Td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}

export function ModelsTab({ data }: { data: ProviderEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { installed, notInstalled } = partitionByInstalled(data);

  const toggleExpand = (tool: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🧠 Models</h2>

      <InventorySectionHeader title="已安裝" count={installed.length} variant="installed" />
      <ModelsTable entries={installed} expanded={expanded} toggleExpand={toggleExpand} />

      <InventorySectionHeader title="未安裝" count={notInstalled.length} variant="notInstalled" />
      <ModelsTable entries={notInstalled} expanded={expanded} toggleExpand={toggleExpand} />
    </>
  );
}
