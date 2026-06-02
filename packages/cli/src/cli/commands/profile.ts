import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import { AppError } from "../../core/errors/app-error.js";
import type { ProfileInfo } from "../../services/profile-service.js";

function handleError(err: unknown): never {
  if (err instanceof AppError) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exitCode = 1;
    throw err;
  }
  throw err;
}

function resolveProfile(ctx: AppContext, idOrName: string, group?: string): ProfileInfo {
  return ctx.profileService.findProfile(idOrName, group);
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

function groupOption(cmd: Command): Command {
  return cmd.option("--group <name>", "Profile group name or id");
}

export function registerProfileCommands(program: Command, getCtx: () => AppContext): void {
  const profile = program.command("profile").description("Manage terminal profiles (primary data model)");

  profile
    .command("list")
    .description("List profiles (optionally in one profile group)")
    .option("--group <name>", "Profile group name or id")
    .action((opts: { group?: string }) => {
      try {
        const forest = getCtx().profileService.getForest();
        const nodes = opts.group
          ? [getCtx().profileService.resolveGroup(opts.group)].map((ws) => {
              const node = forest.groups.find((g) => g.id === ws.id);
              return (
                node ?? {
                  id: ws.id,
                  name: ws.name,
                  profileCount: 0,
                  updatedAt: null,
                  profiles: [],
                }
              );
            })
          : forest.groups;

        let any = false;
        for (const node of nodes) {
          if (node.profiles.length === 0 && !opts.group) continue;
          any = true;
          console.log(chalk.bold(`\n${node.name}\n`));
          if (node.profiles.length === 0) {
            console.log(chalk.dim("  (no profiles)"));
          } else {
            for (const p of node.profiles) {
              const active =
                node.id === forest.lastActiveGroupId ? forest.lastActiveProfileId : null;
              console.log(formatProfile(p, active));
            }
          }
        }
        if (!any) {
          console.log(
            chalk.yellow(
              'No profiles yet. Run: ai-shelf profile create <name> [--group <group>]',
            ),
          );
        } else {
          console.log();
        }
      } catch (err) {
        handleError(err);
      }
    });

  groupOption(
    profile
      .command("create")
      .argument("<name>", "Profile name")
      .option("--cwd <path>", "Default working directory")
      .option("--tool <tool>", "Default AI tool (claude, copilot, cursor, …)")
      .option("--color <hex>", "Accent color (#RRGGBB) or omit for auto")
      .description("Create a profile"),
  ).action(
    (
      name: string,
      opts: { group?: string; cwd?: string; tool?: string; color?: string },
    ) => {
      try {
        const ctx = getCtx();
        const groupRef = opts.group ?? ctx.profileService.defaultGroupIdOrName();
        const created = ctx.profileService.create(groupRef, name, {
          defaultCwd: opts.cwd,
          defaultTool: opts.tool,
          accentColor: opts.color ?? undefined,
        });
        console.log(chalk.green(`✓ Profile created: ${created.name}`));
        console.log(chalk.dim(`  id: ${created.id}`));
        if (created.defaultCwd) console.log(chalk.dim(`  cwd: ${created.defaultCwd}`));
      } catch (err) {
        handleError(err);
      }
    },
  );

  groupOption(
    profile
      .command("update")
      .argument("<profile>", "Profile id or name")
      .option("--name <name>", "Rename profile")
      .option("--cwd <path>", "Default working directory")
      .option("--tool <tool>", "Default AI tool")
      .option("--broadcast", "Enable broadcast input across panes")
      .option("--no-broadcast", "Disable broadcast input")
      .option("--color <hex>", "Accent color (#RRGGBB); use empty string to clear")
      .description("Update profile settings"),
  ).action(
    (
      profileRef: string,
      opts: {
        group?: string;
        name?: string;
        cwd?: string;
        tool?: string;
        broadcast?: boolean;
        color?: string;
      },
    ) => {
      try {
        const ctx = getCtx();
        const existing = resolveProfile(ctx, profileRef, opts.group);
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

  groupOption(
    profile.command("delete").argument("<profile>", "Profile id or name").description("Delete a profile"),
  ).action((profileRef: string, opts: { group?: string }) => {
    try {
      const ctx = getCtx();
      const existing = resolveProfile(ctx, profileRef, opts.group);
      ctx.profileService.delete(existing.id);
      console.log(chalk.green(`✓ Profile deleted: ${existing.name}`));
    } catch (err) {
      handleError(err);
    }
  });

  groupOption(
    profile
      .command("reorder")
      .argument("<profiles...>", "Profile ids or names in desired order")
      .description("Reorder profiles within a group (must include every profile in that group)"),
  ).action((profileRefs: string[], opts: { group?: string }) => {
    try {
      const ctx = getCtx();
      const groupRef = opts.group ?? ctx.profileService.defaultGroupIdOrName();
      const orderedIds = profileRefs.map((ref) => resolveProfile(ctx, ref, opts.group).id);
      const forest = ctx.profileService.reorder(groupRef, orderedIds);
      const node = forest.groups.find((g) => g.id === ctx.profileService.resolveGroup(groupRef).id);
      console.log(chalk.green("✓ Profiles reordered"));
      for (const p of node?.profiles ?? []) {
        const active =
          node?.id === forest.lastActiveGroupId ? forest.lastActiveProfileId : null;
        console.log(formatProfile(p, active));
      }
      console.log();
    } catch (err) {
      handleError(err);
    }
  });

  groupOption(
    profile
      .command("exec")
      .argument("<profile>", "Profile name or id")
      .argument("<command...>", "Command to send")
      .option("-b, --broadcast", "Send to all running CLI sessions in the profile")
      .option("--session <name>", "Target session by name")
      .description("Send command to CLI-managed sessions under a profile"),
  ).action(
    (
      profileRef: string,
      commandParts: string[],
      opts: { group?: string; broadcast?: boolean; session?: string },
    ) => {
      try {
        const ctx = getCtx();
        const p = resolveProfile(ctx, profileRef, opts.group);
        const group = ctx.profileGroupService.resolve(p.workspaceId);
        const command = commandParts.join(" ");
        const result = ctx.execService.exec(group.name, p.name, command, {
          session: opts.session,
          broadcast: opts.broadcast,
        });
        if ("sent" in result) {
          console.log(
            chalk.green(
              `✓ Broadcast to ${String(result.sent.length)} session(s): ${result.sent.join(", ")}`,
            ),
          );
          console.log(chalk.dim(`  group: ${group.name}  profile: ${p.name}  command: ${command}`));
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
