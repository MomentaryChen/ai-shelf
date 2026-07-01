import { Command } from "commander";
import chalk from "chalk";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

type FlowCore = typeof import("../../../../../dist/flow/core.js");

async function loadFlowCore(): Promise<FlowCore> {
  const here = dirname(fileURLToPath(import.meta.url));
  const corePath = join(here, "../../../dist/flow/core.js");
  return import(pathToFileURL(corePath).href) as Promise<FlowCore>;
}

function handleFlowCliError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Cannot find module") || message.includes("ERR_MODULE_NOT_FOUND")) {
    console.error(
      chalk.red(
        "Flow module not built. Run `pnpm build` from the ai-shelf repo root, then retry.",
      ),
    );
    process.exitCode = 1;
    throw err;
  }
  throw err;
}

export function registerFlowCommands(program: Command): void {
  const flow = program.command("flow").description("Automation flows (.flow.md)");

  flow
    .command("list")
    .description("List flows from %APPDATA%/ai-shelf/flows")
    .action(async () => {
      try {
        const core = await loadFlowCore();
        core.initFlowCore();
        const flows = core.listFlows();
        if (flows.length === 0) {
          console.log("No flows found.");
          return;
        }
        for (const f of flows) {
          const schedule = f.schedule ?? "manual";
          const next = f.nextRunAt ? chalk.dim(` next=${f.nextRunAt}`) : "";
          const enabled = f.enabled ? chalk.green("on") : chalk.dim("off");
          console.log(`${chalk.cyan(f.id)}\t${enabled}\t${schedule}\t${f.phaseCount} phases${next}`);
        }
      } catch (err) {
        handleFlowCliError(err);
      }
    });

  flow
    .command("run")
    .description("Run a flow by id and wait for completion")
    .argument("<flowId>", "Flow id")
    .action(async (flowId: string) => {
      try {
        const core = await loadFlowCore();
        core.initFlowCore();
        const res = await core.runFlow(flowId.trim(), { wait: true, trigger: "manual" });
        if (!res.ok) {
          console.error(chalk.red(res.error ?? "run failed"));
          process.exitCode = 1;
          return;
        }
        console.log(`runId=${res.runId} status=${res.state?.status ?? "unknown"}`);
        if (res.state?.status === "failed") {
          process.exitCode = 1;
        }
      } catch (err) {
        handleFlowCliError(err);
      }
    });

  flow
    .command("due")
    .description("Run flows whose cron schedule is due this minute (for Task Scheduler)")
    .action(async () => {
      try {
        const core = await loadFlowCore();
        core.initFlowCore();
        const result = await core.runDueFlows();
        console.log(JSON.stringify(result, null, 2));
        if (result.errors.length > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        handleFlowCliError(err);
      }
    });
}
