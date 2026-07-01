import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Notification } from "electron";
import { getAppDataDir } from "ai-shelf";
import {
  deleteFlow,
  getFlowFilePath,
  getFlowRunState,
  getFlowsDir,
  initFlowCore,
  listFlows,
  listRecentRuns,
  onFlowRunState,
  readFlowFile,
  runDueFlows,
  runFlow,
  saveFlowSchedule,
} from "../flow/core.js";
import { setFlowNotifyHooks } from "../flow/flow-notify.js";

export {
  deleteFlow,
  getFlowFilePath,
  getFlowRunState,
  getFlowsDir,
  listFlows,
  listRecentRuns,
  onFlowRunState,
  readFlowFile,
  runDueFlows,
  runFlow,
  saveFlowSchedule,
};

function bundledFlowPath(fileName: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "assets", "flows", fileName);
}

function seedExampleFlow(): void {
  const flowsDir = join(getAppDataDir(), "flows");
  const exampleDest = join(flowsDir, "example-google-check.flow.md");
  const exampleSrc = bundledFlowPath("example-google-check.flow.md");
  if (!existsSync(exampleDest) && existsSync(exampleSrc)) {
    copyFileSync(exampleSrc, exampleDest);
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
  });
}

export function initFlowService(): void {
  initFlowCore();
  mkdirSync(join(getAppDataDir(), "flows"), { recursive: true });
  seedExampleFlow();
  wireDesktopNotifyOnFail();
}
