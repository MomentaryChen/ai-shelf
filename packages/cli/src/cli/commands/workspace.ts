import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import { AppError } from "../../core/errors/app-error.js";

export function registerWorkspaceCommands(program: Command, getCtx: () => AppContext): void {
  const workspace = program.command("workspace").description("Manage workspaces");

  workspace
    .command("create")
    .argument("<name>", "Workspace name")
    .option("--root <path>", "Project root path")
    .description("Create a new workspace")
    .action((name: string, opts: { root?: string }) => {
      try {
        const ws = getCtx().workspaceService.create(name, opts.root);
        console.log(chalk.green(`✓ Workspace created: ${ws.name}`));
        if (ws.root_path) console.log(chalk.dim(`  root: ${ws.root_path}`));
      } catch (err) {
        handleError(err);
      }
    });

  workspace
    .command("list")
    .description("List all workspaces")
    .action(() => {
      try {
        const list = getCtx().workspaceService.list();
        if (list.length === 0) {
          console.log(chalk.yellow("No workspaces yet. Run: ai-shelf workspace create <name>"));
          return;
        }
        console.log(chalk.bold("\nWorkspaces\n"));
        for (const ws of list) {
          console.log(`  ${chalk.cyan(ws.name)}${ws.root_path ? chalk.dim(`  ${ws.root_path}`) : ""}`);
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });

  workspace
    .command("delete")
    .argument("<name>", "Workspace name")
    .description("Delete workspace and all groups/sessions")
    .action((name: string) => {
      try {
        const ctx = getCtx();
        ctx.sessionService.stopAllInWorkspace(name);
        ctx.workspaceService.delete(name);
        console.log(chalk.green(`✓ Workspace deleted: ${name}`));
      } catch (err) {
        handleError(err);
      }
    });
}

function handleError(err: unknown): never {
  if (err instanceof AppError) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exitCode = 1;
    throw err;
  }
  throw err;
}
