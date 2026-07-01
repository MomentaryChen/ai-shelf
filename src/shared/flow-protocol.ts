export const FLOW_PROGRESS_PREFIX = "FLOW_PROGRESS ";
export const FLOW_OUTPUT_BEGIN = "FLOW_OUTPUT_BEGIN";

export function buildRunnerPrompt(body: string, phaseIds: string[]): string {
  const phaseList =
    phaseIds.length > 0
      ? phaseIds.map((id) => `- ${id}`).join("\n")
      : "- (no predefined phases — emit progress if you use logical steps)";

  return `${body.trim()}

---
【執行協議 — 系統注入，請遵守】

已知 phase id：
${phaseList}

**進度回報**：請使用 MCP 工具 \`flow_progress\`（不要用 stdout 印進度行）：
- 開始某 phase：\`flow_progress({ type: "phase.started", phaseId: "<id>" })\`
- 完成：\`flow_progress({ type: "phase.done", phaseId: "<id>" })\`
- 失敗：\`flow_progress({ type: "phase.failed", phaseId: "<id>", message: "原因" })\`
- 狀態訊息：\`flow_progress({ type: "phase.message", phaseId: "<id>", message: "..." })\`

**最終產出**：完成所有 phase 後，用 \`flow_output({ content: "..." })\` 寫入完整報告（Markdown）。
若 \`flow_output\` 不可用，可改在 stdout 輸出 \`FLOW_OUTPUT_BEGIN\` 後接報告正文。`;
}
