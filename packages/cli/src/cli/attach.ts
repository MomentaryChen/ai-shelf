import chalk from "chalk";
import type { AppContext } from "../infra/bootstrap.js";
import type { SessionModel } from "../models/session.js";
import { exitWhenDone } from "./lifecycle.js";

/** Ctrl+] — same detach key as telnet / `docker attach`-style tools. */
const DETACH_KEY = "\x1d";

export type AttachResult = "exited" | "detached";

/**
 * Keep the CLI attached to a PTY it just started, forwarding output (and keystrokes when
 * stdin is a TTY). Resolves when the PTY exits or the user presses Ctrl+]. The PTY lives
 * only as long as this process, so the caller's teardown stops it afterwards.
 */
export function attachSession(ctx: AppContext, session: SessionModel): Promise<AttachResult> {
  const proc = ctx.ptyRuntime.get(ctx.sessionRuntime.runtimeIdFor(session.id));
  if (!proc) return Promise.resolve("exited");
  exitWhenDone();

  const { stdin, stdout } = process;
  const interactive = stdin.isTTY && stdout.isTTY;
  console.log(
    chalk.dim(
      interactive
        ? `  attached to ${session.name} (pid ${String(proc.pid)}) — exit the shell or press Ctrl+] to stop the session`
        : `  attached to ${session.name} (pid ${String(proc.pid)}, output only) — press Ctrl+C to stop the session`,
    ),
  );

  return new Promise<AttachResult>((resolve) => {
    const cleanups: (() => void)[] = [];
    let done = false;
    const finish = (result: AttachResult): void => {
      if (done) return;
      done = true;
      for (const fn of cleanups) fn();
      resolve(result);
    };

    const dataSub = proc.onData((data) => {
      stdout.write(data);
    });
    cleanups.push(() => {
      dataSub.dispose();
    });
    const exitSub = proc.onExit(() => {
      finish("exited");
    });
    cleanups.push(() => {
      exitSub.dispose();
    });

    if (!interactive) return;

    const write = (text: string): void => {
      try {
        proc.write(text);
      } catch {
        /* PTY already gone; onExit will finish */
      }
    };
    const onInput = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const detachAt = text.indexOf(DETACH_KEY);
      if (detachAt < 0) {
        write(text);
        return;
      }
      if (detachAt > 0) write(text.slice(0, detachAt));
      finish("detached");
    };
    const onResize = (): void => {
      try {
        proc.resize(stdout.columns, stdout.rows);
      } catch {
        /* PTY already gone */
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onInput);
    stdout.on("resize", onResize);
    onResize();
    cleanups.push(() => {
      stdin.off("data", onInput);
      stdout.off("resize", onResize);
      stdin.setRawMode(false);
      stdin.pause();
    });
  });
}
