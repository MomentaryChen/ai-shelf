import { useState } from "react";
import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { YesNo } from "./Badge";
import { toolIcon, toolLabel, formatContext } from "../utils";

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

export function ModelsTab({ data }: { data: ProviderEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const LIMIT = 10;
  const toggleExpand = (tool: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🧠 Models</h2>

      <Card>
        <DataTable headers={["Tool", "Available Models", "Context", "Streaming", "Tool Calls", "Vision"]}>
          {data.map((e) => (
            <tr key={e.tool}>
              <Td>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span>{toolIcon(e.tool)}</span>
                  <strong>{toolLabel(e.tool)}</strong>
                </div>
              </Td>
              <Td>
                {(() => {
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
              <Td>{formatContext(e.capabilities.contextTokens)}</Td>
              <Td>
                <YesNo value={e.capabilities.streaming} />
              </Td>
              <Td>
                <YesNo value={e.capabilities.toolCalls} />
              </Td>
              <Td>
                <YesNo value={e.capabilities.vision} />
              </Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
