#!/usr/bin/env node
import { Command } from "commander";
import { bootstrap, type AppContext } from "../infra/bootstrap.js";
import { APP_NAME, APP_TITLE } from "../config/config.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { registerGroupCommands } from "./commands/group.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerTuiCommand } from "./commands/tui.js";

let ctx: AppContext | null = null;

function getCtx(): AppContext {
  if (!ctx) ctx = bootstrap();
  return ctx;
}

const program = new Command();

program
  .name(APP_NAME)
  .description(APP_TITLE)
  .version("0.2.0")
  .hook("postAction", () => {
    ctx?.close();
    ctx = null;
  });

registerWorkspaceCommands(program, getCtx);
registerGroupCommands(program, getCtx);
registerSessionCommands(program, getCtx);
registerTuiCommand(program, getCtx);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  ctx?.close();
  process.exit(1);
});
