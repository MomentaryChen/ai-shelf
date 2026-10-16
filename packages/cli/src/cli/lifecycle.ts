/** Conventional `128 + signal number` exit codes. */
const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
} as const satisfies Partial<Record<NodeJS.Signals, number>>;

let forceExit = false;

/**
 * Mark the running command as interactive (TUI, attached PTY). Blessed and node-pty can
 * leave handles open after cleanup, so `main.ts` exits explicitly once the command and
 * its teardown have finished.
 */
export function exitWhenDone(): void {
  forceExit = true;
}

export function shouldForceExit(): boolean {
  return forceExit;
}

/**
 * Run `cleanup` (kill PTYs started by this process, mark them stopped, close the DB)
 * whenever the CLI process ends: normal exit, Ctrl+C, SIGTERM or a closed terminal.
 * `cleanup` must be synchronous and idempotent.
 */
export function installShutdownHandlers(cleanup: () => void): void {
  const runCleanup = (): void => {
    try {
      cleanup();
    } catch {
      /* best effort while exiting */
    }
  };

  for (const [signal, code] of Object.entries(SIGNAL_EXIT_CODES)) {
    process.once(signal, () => {
      runCleanup();
      process.exit(code);
    });
  }
  process.once("exit", runCleanup);
}
