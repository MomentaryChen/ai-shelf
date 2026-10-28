import { Command } from "commander";
import type { AppContext } from "../../infra/bootstrap.js";
import { startTui } from "../../tui/app.js";
import { exitWhenDone } from "../lifecycle.js";

export function registerTuiCommand(program: Command, getCtx: () => AppContext): void {
  program
    .command("tui")
    .description("Launch terminal workspace manager TUI")
    .action(async () => {
      exitWhenDone();
      // Resolves when the user quits; the postAction hook then closes the database.
      await startTui(getCtx());
    });
}
