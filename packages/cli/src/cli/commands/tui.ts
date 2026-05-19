import { Command } from "commander";
import type { AppContext } from "../../infra/bootstrap.js";
import { startTui } from "../../tui/app.js";

export function registerTuiCommand(program: Command, getCtx: () => AppContext): void {
  program
    .command("tui")
    .description("Launch terminal workspace manager TUI")
    .action(() => {
      startTui(getCtx());
    });
}
