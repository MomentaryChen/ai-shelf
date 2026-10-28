import { AppError } from "../core/errors/app-error.js";

/** Set to `1` / `true` to print stack traces for CLI errors. */
export const DEBUG_ENV = "AI_SHELF_DEBUG";

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[DEBUG_ENV]?.trim().toLowerCase();
  return raw !== undefined && raw !== "" && raw !== "0" && raw !== "false" && raw !== "off";
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

/**
 * Single user-facing rendering of a CLI failure: `Error: <message>`, plus stack traces
 * (including `cause`) only when debugging is enabled.
 */
export function formatCliError(err: unknown, debug: boolean): string {
  const lines = [`Error: ${describe(err)}`];
  if (debug) {
    let current: unknown = err;
    let depth = 0;
    while (current instanceof Error && depth < 5) {
      if (depth > 0) lines.push(`Caused by: ${describe(current)}`);
      if (current.stack) lines.push(current.stack);
      current = (current as { cause?: unknown }).cause;
      depth += 1;
    }
  } else if (!(err instanceof AppError)) {
    lines.push(`(unexpected error; set ${DEBUG_ENV}=1 for the stack trace)`);
  }
  return lines.join("\n");
}

/**
 * Command-level catch helper. Errors are reported exactly once by the top-level handler in
 * `cli/main.ts`, so this only forwards them.
 */
export function handleError(err: unknown): never {
  throw err;
}
