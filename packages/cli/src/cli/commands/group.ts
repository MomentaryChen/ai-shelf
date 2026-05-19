import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import { AppError } from "../../core/errors/app-error.js";

export function registerGroupCommands(program: Command, getCtx: () => AppContext): void {
  const group = program.command("group").description("Manage groups within a workspace");

  group
    .command("create")
    .argument("<workspace>", "Workspace name")
    .argument("<name>", "Group name")
    .description("Create a group in a workspace")
    .action((workspaceName: string, groupName: string) => {
      try {
        const g = getCtx().groupService.create(workspaceName, groupName);
        console.log(chalk.green(`✓ Group created: ${workspaceName}/${g.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  group
    .command("list")
    .argument("<workspace>", "Workspace name")
    .description("List groups in a workspace")
    .action((workspaceName: string) => {
      try {
        const list = getCtx().groupService.list(workspaceName);
        if (list.length === 0) {
          console.log(chalk.yellow(`No groups in workspace "${workspaceName}"`));
          return;
        }
        console.log(chalk.bold(`\nGroups in ${workspaceName}\n`));
        for (const g of list) {
          console.log(`  ${chalk.cyan(g.name)}`);
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });

  group
    .command("delete")
    .argument("<workspace>", "Workspace name")
    .argument("<name>", "Group name")
    .description("Delete a group and its sessions")
    .action((workspaceName: string, groupName: string) => {
      try {
        getCtx().groupService.delete(workspaceName, groupName);
        console.log(chalk.green(`✓ Group deleted: ${workspaceName}/${groupName}`));
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
