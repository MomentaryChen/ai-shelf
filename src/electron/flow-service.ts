import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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
