import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import { AppError } from "../../core/errors/app-error.js";
import type { ProfileInfo } from "../../services/profile-service.js";
import { PROFILES_WORKSPACE_NAME } from "../../services/profile-service.js";

function handleError(err: unknown): never {
  if (err instanceof AppError) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exitCode = 1;
    throw err;
  }
  throw err;
}

function resolveProfile(ctx: AppContext, idOrName: string): ProfileInfo {
  const tree = ctx.profileService.getTree();
  const byId = tree.profiles.find((p) => p.id === idOrName);
  if (byId) return byId;
  const byName = tree.profiles.find((p) => p.name === idOrName);
  if (byName) return byName;
  throw new AppError(`Profile "${idOrName}" not found`, "PROFILE_NOT_FOUND");
}

function formatProfile(p: ProfileInfo, activeId: string | null): string {
  const marker = p.id === activeId ? chalk.green("● ") : "  ";
  const panes =
    p.paneCount > 0
      ? chalk.dim(`  ${String(p.paneCount)} pane${p.paneCount === 1 ? "" : "s"}`)
      : "";
  const cwd = p.defaultCwd ? chalk.dim(`  ${p.defaultCwd}`) : "";
  const tool = chalk.magenta(` [${p.defaultTool}]`);
  return `${marker}${chalk.cyan(p.name)}${tool}${panes}${cwd}`;
}

export function registerProfileCommands(program: Command, getCtx: () => AppContext): void {
  const profile = program.command("profile").description("Manage terminal profiles (primary data model)");

  profile
    .command("list")
    .description("List all profiles")
    .action(() => {
      try {
        const tree = getCtx().profileService.getTree();
        if (tree.profiles.length === 0) {
          console.log(chalk.yellow('No profiles yet. Run: ai-shelf profile create <name>'));
          return;
        }
        console.log(chalk.bold("\nProfiles\n"));
        console.log(chalk.dim(`  Shared with the desktop app via ${PROFILES_WORKSPACE_NAME} workspace in SQLite.\n`));
        for (const p of tree.profiles) {
          console.log(formatProfile(p, tree.lastActiveProfileId));
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });

  profile
    .command("create")
    .argument("<name>", "Profile name")
    .option("--cwd <path>", "Default working directory")
    .option("--tool <tool>", "Default AI tool (claude, copilot, cursor, …)")
    .option("--color <hex>", "Accent color (#RRGGBB) or omit for auto")
    .description("Create a profile")
    .action((name: string, opts: { cwd?: string; tool?: string; color?: string }) => {
      try {
        const created = getCtx().profileService.create(
          name,
          opts.cwd,
          opts.tool,
          opts.color ?? undefined,
        );
        console.log(chalk.green(`✓ Profile created: ${created.name}`));
        console.log(chalk.dim(`  id: ${created.id}`));
        if (created.defaultCwd) console.log(chalk.dim(`  cwd: ${created.defaultCwd}`));
      } catch (err) {
        handleError(err);
      }
    });

  profile
    .command("update")
    .argument("<profile>", "Profile id or name")
    .option("--name <name>", "Rename profile")
    .option("--cwd <path>", "Default working directory")
    .option("--tool <tool>", "Default AI tool")
    .option("--broadcast", "Enable broadcast input across panes")
    .option("--no-broadcast", "Disable broadcast input")
    .option("--color <hex>", "Accent color (#RRGGBB); use empty string to clear")
    .description("Update profile settings")
    .action(
      (
        profileRef: string,
        opts: {
          name?: string;
          cwd?: string;
          tool?: string;
          broadcast?: boolean;
          color?: string;
        },
      ) => {
        try {
          const ctx = getCtx();
          const existing = resolveProfile(ctx, profileRef);
          const patch: {
            name?: string;
            defaultCwd?: string;
            defaultTool?: string;
            broadcastInput?: boolean;
            accentColor?: string | null;
          } = {};
          if (opts.name !== undefined) patch.name = opts.name;
          if (opts.cwd !== undefined) patch.defaultCwd = opts.cwd;
          if (opts.tool !== undefined) patch.defaultTool = opts.tool;
          if (opts.broadcast !== undefined) patch.broadcastInput = opts.broadcast;
          if (opts.color !== undefined) {
            patch.accentColor = opts.color === "" ? null : opts.color;
          }
          const updated = ctx.profileService.update(existing.id, patch);
          console.log(chalk.green(`✓ Profile updated: ${updated.name}`));
        } catch (err) {
          handleError(err);
        }
      },
    );

  profile
    .command("delete")
    .argument("<profile>", "Profile id or name")
    .description("Delete a profile and its saved layout")
    .action((profileRef: string) => {
      try {
        const ctx = getCtx();
        const existing = resolveProfile(ctx, profileRef);
        ctx.profileService.delete(existing.id);
        console.log(chalk.green(`✓ Profile deleted: ${existing.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  profile
    .command("reorder")
    .argument("<profiles...>", "Profile ids or names in desired order")
    .description("Reorder profiles (must include every profile)")
    .action((profileRefs: string[]) => {
      try {
        const ctx = getCtx();
        const orderedIds = profileRefs.map((ref) => resolveProfile(ctx, ref).id);
        const next = ctx.profileService.reorder(orderedIds);
        console.log(chalk.green("✓ Profiles reordered"));
        for (const p of next.profiles) {
          console.log(formatProfile(p, next.lastActiveProfileId));
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });

  profile
    .command("exec")
    .argument("<profile>", "Profile name or id")
    .argument("<command...>", "Command to send")
    .option("-b, --broadcast", "Send to all running CLI sessions in the profile")
    .option("--session <name>", "Target session by name")
    .description("Send command to CLI-managed sessions under a profile")
    .action(
      (profileRef: string, commandParts: string[], opts: { broadcast?: boolean; session?: string }) => {
        try {
          const ctx = getCtx();
          const p = resolveProfile(ctx, profileRef);
          const command = commandParts.join(" ");
          const result = ctx.execService.exec(PROFILES_WORKSPACE_NAME, p.name, command, {
            session: opts.session,
            broadcast: opts.broadcast,
          });
          if ("sent" in result) {
            console.log(
              chalk.green(
                `✓ Broadcast to ${String(result.sent.length)} session(s): ${result.sent.join(", ")}`,
              ),
            );
            console.log(chalk.dim(`  profile: ${p.name}  command: ${command}`));
            for (const s of result.skipped) {
              console.log(chalk.yellow(`  skipped ${s.name}: ${s.reason}`));
            }
          } else {
            console.log(chalk.green(`✓ Sent to ${result.sessionName}: ${command}`));
          }
        } catch (err) {
          handleError(err);
        }
      },
    );
}
