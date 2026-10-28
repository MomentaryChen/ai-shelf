#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";

declare const __CLI_VERSION__: string;
import { bootstrap, type AppContext } from "../infra/bootstrap.js";
import { APP_NAME, APP_TITLE } from "../config/config.js";
import { registerProfileCommands } from "./commands/profile.js";
import { registerProfileGroupCommands } from "./commands/profile-group.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { registerGroupCommands } from "./commands/group.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerTuiCommand } from "./commands/tui.js";
import { registerFlowCommands } from "./commands/flow.js";
import { DEBUG_ENV, formatCliError, isDebugEnabled } from "./errors.js";
import { installShutdownHandlers, shouldForceExit } from "./lifecycle.js";

let ctx: AppContext | null = null;

function getCtx(): AppContext {
  if (!ctx) ctx = bootstrap();
  return ctx;
}

/** Stop PTYs this process started, mark them stopped, close the DB. Safe to call twice. */
function shutdownCtx(): void {
  const current = ctx;
  ctx = null;
  current?.shutdown();
}

installShutdownHandlers(shutdownCtx);

const program = new Command();

program
  .name(APP_NAME)
  .description(APP_TITLE)
  .version(__CLI_VERSION__)
  .addHelpText(
    "after",
    `\nEnvironment:\n  ${DEBUG_ENV}=1  print stack traces when a command fails\n`,
  )
  // Actions are awaited, so this runs only after long-lived commands (tui, attached
  // sessions) have finished — never while they still use the database.
  .hook("postAction", shutdownCtx);

registerProfileCommands(program, getCtx);
registerProfileGroupCommands(program, getCtx);
registerWorkspaceCommands(program, getCtx);
registerGroupCommands(program, getCtx);
registerSessionCommands(program, getCtx);
registerTuiCommand(program, getCtx);
registerFlowCommands(program);

program.parseAsync(process.argv).then(
  () => {
    if (shouldForceExit()) process.exit();
  },
  (err: unknown) => {
    console.error(chalk.red(formatCliError(err, isDebugEnabled())));
    try {
      shutdownCtx();
    } catch {
      /* already reporting a failure */
    }
    process.exit(1);
  },
);
