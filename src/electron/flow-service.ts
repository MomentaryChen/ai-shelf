import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Notification } from "electron";
import { getAppDataDir } from "ai-shelf";
import {
  deleteFlow,
  createFlowFromContent,
  getFlowDagNodeCommand,
  getFlowFilePath,
  getFlowRunState,
  getRunArtifactPath,
  getRunEvents,
  getFlowsDir,
  initFlowCore,
  listFlows,
  listActiveFlowRuns,
  listRecentRuns,
  listRunsForFlow,
  onFlowRunState,
  readFlowFile,
  readRunOutput,
  getLatestRunWithOutput,
  runDueFlows,
  runFlow,
  cancelFlowRun,
  approveFlowGate,
  rejectFlowGate,
  saveFlowSchedule,
  saveFlowRunner,
} from "../flow/core.js";
import { setFlowNotifyHooks } from "../flow/flow-notify.js";
import {
  FLOW_CHAT_DRAFT_ID,
  listFlowPromptLogs,
  readFlowChat,
  saveFlowChat,
} from "../flow/flow-chat-store.js";
import {
  FLOW_TEMPLATE_CATALOG,
  isBundledFlowTemplateFile,
  type FlowTemplateCatalogEntry,
} from "../shared/flow-template-catalog.js";

export {
  createFlowFromContent,
  deleteFlow,
  FLOW_CHAT_DRAFT_ID,
  getFlowDagNodeCommand,
  getFlowFilePath,
  getFlowRunState,
  getRunArtifactPath,
  getRunEvents,
  getFlowsDir,
  listFlowPromptLogs,
  listFlows,
  listActiveFlowRuns,
  listRecentRuns,
  listRunsForFlow,
  onFlowRunState,
  readFlowChat,
  readFlowFile,
  readRunOutput,
  getLatestRunWithOutput,
  runDueFlows,
  runFlow,
  cancelFlowRun,
  approveFlowGate,
  rejectFlowGate,
  saveFlowChat,
  saveFlowSchedule,
  saveFlowRunner,
};

function bundledFlowPath(fileName: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "assets", "flows", fileName);
}

function seedExampleFlows(): void {
  const flowsDir = join(getAppDataDir(), "flows");
  for (const fileName of ["example-google-check.flow.md"]) {
    const dest = join(flowsDir, fileName);
    const src = bundledFlowPath(fileName);
    if (!existsSync(dest) && existsSync(src)) {
      copyFileSync(src, dest);
    }
  }
}

export type FlowTemplateListItem = FlowTemplateCatalogEntry & { installed: boolean };

export function listBundledFlowTemplates(): FlowTemplateListItem[] {
  const flowsDir = getFlowsDir();
  return FLOW_TEMPLATE_CATALOG.map((entry) => ({
    ...entry,
    installed: existsSync(join(flowsDir, `${entry.id}.flow.md`)),
  }));
}

export function readBundledFlowTemplate(
  fileName: string,
): { ok: true; content: string } | { ok: false; error: string } {
  if (!isBundledFlowTemplateFile(fileName)) {
    return { ok: false, error: `Unknown template: ${fileName}` };
  }
  const src = bundledFlowPath(fileName);
  if (!existsSync(src)) {
    return { ok: false, error: `Template file missing: ${fileName}` };
  }
  try {
    return { ok: true, content: readFileSync(src, "utf8") };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function installBundledFlowTemplate(
  templateId: string,
): { ok: boolean; flowId?: string; path?: string; error?: string } {
  const entry = FLOW_TEMPLATE_CATALOG.find((t) => t.id === templateId);
  if (!entry) {
    return { ok: false, error: `Unknown template: ${templateId}` };
  }
  const read = readBundledFlowTemplate(entry.fileName);
  if (!read.ok) {
    return { ok: false, error: read.error };
  }
  const destPath = join(getFlowsDir(), `${entry.id}.flow.md`);
  return createFlowFromContent(read.content, {
    overwrite: existsSync(destPath),
    migrateChatFromDraft: false,
  });
}

function wireDesktopNotifyOnFail(): void {
  setFlowNotifyHooks({
    onRunFailed: (flow, state) => {
      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: `Flow failed: ${flow.id}`,
        body: state.error ?? "Unknown error",
      });
      n.show();
    },
    onRunCompleted: (flow, state) => {
      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: `Flow completed: ${flow.id}`,
        body: state.outputPath ? `Output: ${state.outputPath}` : "Run finished successfully",
      });
      n.show();
    },
  });
}

export function initFlowService(): void {
  initFlowCore();
  mkdirSync(join(getAppDataDir(), "flows"), { recursive: true });
  seedExampleFlows();
  wireDesktopNotifyOnFail();
}
