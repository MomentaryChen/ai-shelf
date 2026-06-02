import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import { AppError } from "../../core/errors/app-error.js";
import type { ProfileGroupInfo } from "../../services/profile-group-service.js";

function handleError(err: unknown): never {
  if (err instanceof AppError) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exitCode = 1;
    throw err;
  }
  throw err;
}

function formatGroup(g: ProfileGroupInfo): string {
  const count =
    g.profileCount > 0
      ? chalk.dim(`  ${String(g.profileCount)} profile${g.profileCount === 1 ? "" : "s"}`)
      : chalk.dim("  (empty)");
  return `  ${chalk.cyan(g.name)}${count}`;
}

export function registerProfileGroupCommands(program: Command, getCtx: () => AppContext): void {
  const pg = program
    .command("profile-group")
    .description("Manage profile groups (organize profiles into categories)");

  pg.command("list")
    .description("List all profile groups")
    .action(() => {
      try {
        const list = getCtx().profileGroupService.list();
        if (list.length === 0) {
          console.log(chalk.yellow("No profile groups yet. Run: ai-shelf profile-group create <name>"));
          return;
        }
        console.log(chalk.bold("\nProfile groups\n"));
        for (const g of list) {
          console.log(formatGroup(g));
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });

  pg.command("create")
    .argument("<name>", "Profile group name")
    .description("Create a profile group")
    .action((name: string) => {
      try {
        const created = getCtx().profileGroupService.create(name);
        console.log(chalk.green(`✓ Profile group created: ${created.name}`));
        console.log(chalk.dim(`  id: ${created.id}`));
      } catch (err) {
        handleError(err);
      }
    });

  pg.command("rename")
    .argument("<group>", "Profile group id or name")
    .argument("<newName>", "New name")
    .description("Rename a profile group")
    .action((groupRef: string, newName: string) => {
      try {
        const updated = getCtx().profileGroupService.rename(groupRef, newName);
        console.log(chalk.green(`✓ Profile group renamed: ${updated.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  pg.command("delete")
    .argument("<group>", "Profile group id or name")
    .description("Delete a profile group and all profiles inside")
    .action((groupRef: string) => {
      try {
        const ctx = getCtx();
        const ws = ctx.profileGroupService.resolve(groupRef);
        ctx.sessionService.stopAllInWorkspace(ws.name);
        ctx.profileGroupService.delete(groupRef);
        console.log(chalk.green(`✓ Profile group deleted: ${ws.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  pg.command("reorder")
    .argument("<groups...>", "Profile group ids or names in desired order")
    .description("Reorder profile groups (must include every group)")
    .action((groupRefs: string[]) => {
      try {
        const ctx = getCtx();
        const orderedIds = groupRefs.map((ref) => ctx.profileGroupService.resolve(ref).id);
        const next = ctx.profileGroupService.reorder(orderedIds);
        console.log(chalk.green("✓ Profile groups reordered"));
        for (const g of next) {
          console.log(formatGroup(g));
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
