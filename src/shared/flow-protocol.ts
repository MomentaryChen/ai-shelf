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

進行中請在 stdout 輸出進度行（不計入最終報告）：
FLOW_PROGRESS {"type":"phase.started","phaseId":"<id>"}
FLOW_PROGRESS {"type":"phase.done","phaseId":"<id>"}
FLOW_PROGRESS {"type":"phase.message","phaseId":"<id>","message":"簡短狀態"}
FLOW_PROGRESS {"type":"phase.failed","phaseId":"<id>","message":"原因"}

最終產出前請單獨輸出一行：
FLOW_OUTPUT_BEGIN
（報告從下一行開始；進度行與協議文字不要出現在報告內）`;
}
