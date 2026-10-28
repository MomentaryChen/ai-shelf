import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import type { SessionModel } from "../../models/session.js";
import { handleError } from "../errors.js";
import { attachSession } from "../attach.js";
import { DEFAULT_PROFILE_GROUP_NAME } from "../../services/profile-group-service.js";
import { warnLegacyWorkspaceModel } from "../deprecation.js";

const SESSION_DEPRECATION = `Prefer \`ai-shelf profile exec <profile> …\` for profile-scoped CLI sessions. Legacy path: profile group "${DEFAULT_PROFILE_GROUP_NAME}", profile name = session group.`;

export function registerSessionCommands(program: Command, getCtx: () => AppContext): void {
  const session = program
    .command("session")
    .description("Manage terminal sessions (legacy — prefer profile commands)");

  session
    .command("create")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<name>", "Session name")
    .option("--cwd <path>", "Working directory")
    .option(
      "--shell <shell>",
      "Shell preference (auto, pwsh, powershell, cmd, bash, zsh, fish, sh)",
    )
    .option(
      "--tool <tool>",
      "AI tool to launch (claude, copilot, cursor, codex, gemini, aider, opencode)",
    )
    .option("--no-start", "Only create metadata, do not spawn PTY")
    .description(
      "Create session and start its PTY attached to this terminal (the session stops when you detach)",
    )
    .action(
      async (
        workspaceName: string,
        groupName: string,
        sessionName: string,
        opts: { cwd?: string; shell?: string; tool?: string; start?: boolean },
      ) => {
        warnLegacyWorkspaceModel(SESSION_DEPRECATION);
        try {
          const ctx = getCtx();
          const s = await ctx.sessionService.create(workspaceName, groupName, sessionName, {
            cwd: opts.cwd,
            shell: opts.shell,
            tool: opts.tool,
            start: opts.start,
          });
          console.log(chalk.green(`✓ Session created: ${workspaceName}/${groupName}/${s.name}`));
          console.log(
            chalk.dim(
              `  cwd: ${s.cwd}  status: ${s.status}${s.pid ? `  pid: ${String(s.pid)}` : ""}`,
            ),
          );
          if (s.status === "running") await attachAndReport(ctx, s);
        } catch (err) {
          handleError(err);
        }
      },
    );

  session
    .command("start")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<name>", "Session name")
    .description(
      "Start PTY for an existing session, attached to this terminal (stops when you detach)",
    )
    .action(async (workspaceName: string, groupName: string, sessionName: string) => {
      warnLegacyWorkspaceModel(SESSION_DEPRECATION);
      try {
        const ctx = getCtx();
        const s = await ctx.sessionService.start(workspaceName, groupName, sessionName);
        console.log(
          chalk.green(`✓ Session started: ${s.name} (pid ${s.pid != null ? String(s.pid) : "—"})`),
        );
        await attachAndReport(ctx, s);
      } catch (err) {
        handleError(err);
      }
    });

  session
    .command("stop")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<name>", "Session name")
    .description("Stop session PTY (also works for sessions started by another ai-shelf process)")
    .action((workspaceName: string, groupName: string, sessionName: string) => {
      warnLegacyWorkspaceModel(SESSION_DEPRECATION);
      try {
        const s = getCtx().sessionService.stop(workspaceName, groupName, sessionName);
        console.log(chalk.green(`✓ Session stopped: ${s.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  session
    .command("list")
    .argument("<workspace>", "Workspace name")
    .option("--group <name>", "Filter by group")
    .description("List sessions")
    .action((workspaceName: string, opts: { group?: string }) => {
      warnLegacyWorkspaceModel(SESSION_DEPRECATION);
      try {
        const list = getCtx().sessionService.list(workspaceName, opts.group);
        if (list.length === 0) {
          console.log(chalk.yellow("No sessions found"));
          return;
        }
        console.log(chalk.bold(`\nSessions\n`));
        for (const s of list) {
          const tool = s.tool ? chalk.magenta(` [${s.tool}]`) : "";
          console.log(
            `  ${chalk.cyan(s.name)}${tool}  ${chalk.dim(s.status)}  ${chalk.dim(s.cwd)}`,
          );
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });

  session
    .command("exec")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<command...>", "Command to send")
    .option("--session <name>", "Target session (default: first in group)")
    .option("-b, --broadcast", "Send to all running sessions in the group")
    .description("Send command to session PTY stdin")
    .action(
      (
        workspaceName: string,
        groupName: string,
        commandParts: string[],
        opts: { session?: string; broadcast?: boolean },
      ) => {
        warnLegacyWorkspaceModel(
          `Use \`ai-shelf profile exec <profile> …\` instead of session exec.`,
        );
        try {
          const command = commandParts.join(" ");
          const result = getCtx().execService.exec(workspaceName, groupName, command, {
            session: opts.session,
            broadcast: opts.broadcast,
          });

          if ("sent" in result) {
            console.log(
              chalk.green(
                `✓ Broadcast to ${String(result.sent.length)} session(s): ${result.sent.join(", ")}`,
              ),
            );
            console.log(chalk.dim(`  command: ${command}`));
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

  session
    .command("delete")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<name>", "Session name")
    .description("Delete session metadata (stops PTY if running)")
    .action((workspaceName: string, groupName: string, sessionName: string) => {
      warnLegacyWorkspaceModel(SESSION_DEPRECATION);
      try {
        getCtx().sessionService.delete(workspaceName, groupName, sessionName);
        console.log(chalk.green(`✓ Session deleted: ${workspaceName}/${groupName}/${sessionName}`));
      } catch (err) {
        handleError(err);
      }
    });
}

/**
 * PTYs die with the process that spawned them, so `create` / `start` stay attached until the
 * PTY exits or the user detaches; the postAction hook then stops it and closes the DB.
 */
async function attachAndReport(ctx: AppContext, session: SessionModel): Promise<void> {
  const result = await attachSession(ctx, session);
  console.log(
    chalk.dim(
      result === "exited"
        ? `\n  session ${session.name} exited`
        : `\n  detached — stopping session ${session.name}`,
    ),
  );
}
