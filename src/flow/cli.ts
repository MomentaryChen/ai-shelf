#!/usr/bin/env node
import { summarizeCompletedPhases } from "../shared/flow-completed-phases.js";
import {
  getFlowRunState,
  initFlowCore,
  listFlows,
  listRunsForFlow,
  runDueFlows,
  runFlow,
} from "./core.js";

const [, , command, ...rest] = process.argv;

function printUsage(): void {
  console.log("Usage: node dist/flow/cli.js <list|run|due|status> [args]");
  console.log("  status <runId>           Completed phase ids for a run");
  console.log("  status --flow <flowId>   Latest run for a flow");
}

async function main(): Promise<void> {
  initFlowCore();

  if (command === "list" || !command) {
    if (!command) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    const flows = listFlows();
    if (flows.length === 0) {
      console.log("No flows found.");
      return;
    }
    for (const f of flows) {
      const schedule = f.schedule ? f.schedule : "manual";
      const next = f.nextRunAt ? ` next=${f.nextRunAt}` : "";
      const enabled = f.enabled ? "on" : "off";
      console.log(`${f.id}\t${enabled}\t${schedule}\t${f.phaseCount} phases${next}`);
    }
    return;
  }

  if (command === "run") {
    const flowId = rest[0]?.trim();
    if (!flowId) {
      console.error("Usage: node dist/flow/cli.js run <flowId>");
      process.exitCode = 1;
      return;
    }
    const res = await runFlow(flowId, { wait: true, trigger: "manual" });
    if (!res.ok) {
      console.error(res.error ?? "run failed");
      process.exitCode = 1;
      return;
    }
    console.log(`runId=${res.runId} status=${res.state?.status ?? "unknown"}`);
    if (res.state?.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "due") {
    const result = await runDueFlows();
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "status") {
    const flowFlag = rest.indexOf("--flow");
    let state = null;

    if (flowFlag >= 0) {
      const flowId = rest[flowFlag + 1]?.trim();
      if (!flowId) {
        console.error("Usage: node dist/flow/cli.js status --flow <flowId>");
        process.exitCode = 1;
        return;
      }
      state = listRunsForFlow(flowId, 1)[0] ?? null;
      if (!state) {
        console.error(`No runs found for flow: ${flowId}`);
        process.exitCode = 1;
        return;
      }
    } else {
      const runId = rest[0]?.trim();
      if (!runId) {
        console.error("Usage: node dist/flow/cli.js status <runId>");
        console.error("       node dist/flow/cli.js status --flow <flowId>");
        process.exitCode = 1;
        return;
      }
      state = getFlowRunState(runId);
      if (!state) {
        console.error(`Run not found: ${runId}`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(JSON.stringify(summarizeCompletedPhases(state)));
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
