import { Command } from "commander";
import chalk from "chalk";
import type { AppContext } from "../../infra/bootstrap.js";
import { AppError } from "../../core/errors/app-error.js";

export function registerSessionCommands(program: Command, getCtx: () => AppContext): void {
  const session = program.command("session").description("Manage terminal sessions");

  session
    .command("create")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<name>", "Session name")
    .option("--cwd <path>", "Working directory")
    .option("--shell <shell>", "Shell type (pwsh, powershell, cmd)")
    .option("--tool <tool>", "AI tool to launch (claude, copilot, cursor, codex, gemini, aider, opencode)")
    .option("--no-start", "Only create metadata, do not spawn PTY")
    .description("Create session and optionally start PTY")
    .action(
      async (
        workspaceName: string,
        groupName: string,
        sessionName: string,
        opts: { cwd?: string; shell?: string; tool?: string; start?: boolean },
      ) => {
        try {
          const s = await getCtx().sessionService.create(workspaceName, groupName, sessionName, {
            cwd: opts.cwd,
            shell: opts.shell,
            tool: opts.tool,
            start: opts.start,
          });
          console.log(chalk.green(`✓ Session created: ${workspaceName}/${groupName}/${s.name}`));
          console.log(chalk.dim(`  cwd: ${s.cwd}  status: ${s.status}${s.pid ? `  pid: ${s.pid}` : ""}`));
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
    .description("Start PTY for an existing session")
    .action(async (workspaceName: string, groupName: string, sessionName: string) => {
      try {
        const s = await getCtx().sessionService.start(workspaceName, groupName, sessionName);
        console.log(chalk.green(`✓ Session started: ${s.name} (pid ${s.pid ?? "—"})`));
      } catch (err) {
        handleError(err);
      }
    });

  session
    .command("stop")
    .argument("<workspace>", "Workspace name")
    .argument("<group>", "Group name")
    .argument("<name>", "Session name")
    .description("Stop session PTY")
    .action((workspaceName: string, groupName: string, sessionName: string) => {
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
        try {
          const command = commandParts.join(" ");
          const result = getCtx().execService.exec(workspaceName, groupName, command, {
            session: opts.session,
            broadcast: opts.broadcast,
          });

          if ("sent" in result) {
            console.log(
              chalk.green(`✓ Broadcast to ${result.sent.length} session(s): ${result.sent.join(", ")}`),
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
      try {
        getCtx().sessionService.delete(workspaceName, groupName, sessionName);
        console.log(chalk.green(`✓ Session deleted: ${workspaceName}/${groupName}/${sessionName}`));
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
