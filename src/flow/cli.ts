#!/usr/bin/env node
import { initFlowCore, listFlows, runDueFlows, runFlow } from "./core.js";

const [, , command, arg] = process.argv;

async function main(): Promise<void> {
  initFlowCore();

  if (command === "list" || !command) {
    if (!command) {
      console.log("Usage: node dist/flow/cli.js <list|run|due> [flowId]");
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
    if (!arg?.trim()) {
      console.error("Usage: node dist/flow/cli.js run <flowId>");
      process.exitCode = 1;
      return;
    }
    const res = await runFlow(arg.trim(), { wait: true, trigger: "manual" });
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

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
