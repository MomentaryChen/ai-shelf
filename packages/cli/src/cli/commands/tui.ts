import { Command } from "commander";
import type { AppContext } from "../../infra/bootstrap.js";
import { exitWhenDone } from "../lifecycle.js";

export function registerTuiCommand(program: Command, getCtx: () => AppContext): void {
  program
    .command("tui")
    .description("Launch terminal workspace manager TUI")
    .action(async () => {
      exitWhenDone();
      // Lazy-load so other commands don't pay for neo-blessed and the TUI tree.
      const { startTui } = await import("../../tui/app.js");
      // Resolves when the user quits; the postAction hook then closes the database.
      await startTui(getCtx());
    });
}
