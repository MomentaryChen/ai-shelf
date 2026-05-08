import { useState } from "react";
import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { YesNo } from "./Badge";
import { toolIcon, toolLabel, formatContext } from "../utils";

function ModelChip({
  name,
  active,
  onClick,
}: {
  name: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-mono whitespace-nowrap transition-all ${
        active
          ? "bg-accent/20 text-accent font-semibold ring-2 ring-accent border border-accent"
          : onClick
            ? "bg-surface-2 text-muted cursor-pointer hover:bg-accent/10 hover:text-accent hover:ring-1 hover:ring-accent/40"
            : "bg-surface-2 text-muted"
      }`}
    >
      {name}
    </span>
  );
}

type Pending = { tool: string; model: string };

export function ModelsTab({
  data,
  modelOverrides,
  onModelChange,
}: {
  data: ProviderEntry[];
  modelOverrides: Record<string, string>;
  onModelChange: (overrides: Record<string, string>) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTool, setSuccessTool] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const LIMIT = 10;
  const toggleExpand = (tool: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });

  const handleChipClick = (tool: string, model: string, isActive: boolean) => {
    if (isActive) return;
    setError(null);
    setPending({ tool, model });
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setLoading(true);
    setError(null);
    const res = await window.api.setDefaultModel(pending.tool, pending.model);
    setLoading(false);
    if (res.success) {
      onModelChange({ ...modelOverrides, [pending.tool]: pending.model });
      setSuccessTool(pending.tool);
      setPending(null);
      setTimeout(() => setSuccessTool(null), 4000);
    } else {
      setError(res.error ?? "Failed to switch model");
    }
  };

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🧠 Models</h2>

      {/* Confirmation bar */}
      {pending && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-[13px]">
          <span>
            切換 <strong>{toolLabel(pending.tool)}</strong> 預設 model 至{" "}
            <code className="rounded bg-warn/20 px-1.5 py-0.5 font-mono text-warn">
              {pending.model}
            </code>
            ？
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="cursor-pointer rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-white transition-all hover:opacity-80 disabled:opacity-50"
            >
              {loading ? "切換中…" : "確認"}
            </button>
            <button
              onClick={() => { setPending(null); setError(null); }}
              disabled={loading}
              className="cursor-pointer rounded-md border border-border px-3 py-1 text-[12px] text-text-secondary transition-all hover:border-accent disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg bg-fail/10 px-4 py-2 text-[13px] text-fail">{error}</div>
      )}

      {successTool && (
        <div className="mb-3 rounded-lg border border-ok/30 bg-ok/10 px-4 py-2 text-[13px] text-ok">
          ✓ 已寫入 <strong>{toolLabel(successTool)}</strong> settings
          {(successTool === "cursor" || successTool === "cursor-agent" || successTool === "agent") &&
            <span className="ml-2 text-text-secondary">— 需在 Cursor 中執行 <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[11px]">Ctrl+Shift+P</kbd> → <em>Reload Window</em> 才會生效</span>
          }
        </div>
      )}

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
                  const isCursor = e.tool === "cursor" || e.tool === "cursor-agent" || e.tool === "agent";
                  const all = e.models && e.models.length > 0 ? e.models : [modelOverrides[e.tool] ?? e.model ?? "default"];
                  const isExpanded = expanded.has(e.tool);
                  const visible = isExpanded ? all : all.slice(0, LIMIT);
                  const hidden = all.length - LIMIT;
                  const activeModel = modelOverrides[e.tool] ?? e.model;
                  return (
                    <div className="flex flex-wrap gap-1">
                      {visible.map((m) => (
                        <ModelChip
                          key={m}
                          name={m}
                          active={m === activeModel}
                          onClick={(!isCursor && e.models && e.models.length > 0) ? () => handleChipClick(e.tool, m, m === activeModel) : undefined}
                        />
                      ))}
                      {all.length > LIMIT && (
                        <button
                          onClick={() => toggleExpand(e.tool)}
                          className="cursor-pointer rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-secondary transition-all hover:border-accent hover:text-accent"
                        >
                          {isExpanded ? "Show less" : `+${hidden} more`}
                        </button>
                      )}
                      {isCursor && (
                        <span className="self-center text-[11px] text-text-secondary opacity-60">（切換暫不支援）</span>
                      )}
                    </div>
                  );
                })()}
              </Td>
              <Td>{formatContext(e.capabilities.contextTokens)}</Td>
              <Td><YesNo value={e.capabilities.streaming} /></Td>
              <Td><YesNo value={e.capabilities.toolCalls} /></Td>
              <Td><YesNo value={e.capabilities.vision} /></Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
