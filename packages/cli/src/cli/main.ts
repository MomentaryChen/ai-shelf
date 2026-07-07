#!/usr/bin/env node
import { Command } from "commander";

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

let ctx: AppContext | null = null;

function getCtx(): AppContext {
  if (!ctx) ctx = bootstrap();
  return ctx;
}

const program = new Command();

program
  .name(APP_NAME)
  .description(APP_TITLE)
  .version(__CLI_VERSION__)
  .hook("postAction", () => {
    ctx?.close();
    ctx = null;
  });

registerProfileCommands(program, getCtx);
registerProfileGroupCommands(program, getCtx);
registerWorkspaceCommands(program, getCtx);
registerGroupCommands(program, getCtx);
registerSessionCommands(program, getCtx);
registerTuiCommand(program, getCtx);
registerFlowCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  ctx?.close();
  process.exit(1);
});
