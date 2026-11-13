/**
 * Sends a task prompt to an agent CLI after its TUI has started, by writing to the PTY
 * (a bracketed paste, then Enter). Typing beats passing the prompt as a launch argument:
 * the launch command goes through cmd / pwsh / bash / WSL / ssh, and multi-line prompts
 * with quotes do not survive all of them.
 *
 * Readiness is a heuristic: output has started and then stayed quiet for a while. If the
 * latest burst of output looks like a blocking dialog (folder trust, login), the gate keeps
 * waiting so the Enter never answers that dialog for the user; once they deal with it the
 * TUI redraws, a fresh burst starts, and the gate re-evaluates.
 */

export interface InitialInputGateOptions {
  /** Never fire earlier than this after spawn. */
  minDelayMs?: number;
  /** Output must be quiet this long. */
  quietMs?: number;
  /** Fire anyway after this long without a dialog (TUI that never stops animating). */
  maxWaitMs?: number;
  /** Give up after this long while a dialog is still showing. */
  dialogTimeoutMs?: number;
}

export type InitialInputDecision = "wait" | "fire" | "give-up";

const DEFAULTS: Required<InitialInputGateOptions> = {
  minDelayMs: 1500,
  quietMs: 900,
  maxWaitMs: 20_000,
  dialogTimeoutMs: 10 * 60_000,
};

const TAIL_MAX = 4096;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Phrases of start-up dialogs that an injected Enter would answer. */
const BLOCKING_DIALOG_RE =
  /do you trust|trust (?:the files|this folder|the contents|this directory)|select login method|sign in with|log ?in to|enter to confirm|press enter to continue|use this api key/i;

export function looksLikeBlockingDialog(text: string): boolean {
  return BLOCKING_DIALOG_RE.test(text.replace(ANSI_RE, "").replace(/\s+/g, " "));
}

export class InitialInputGate {
  private readonly opts: Required<InitialInputGateOptions>;
  private readonly startedAt: number;
  private lastOutputAt: number | null = null;
  private tail = "";

  constructor(now: number, opts: InitialInputGateOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.startedAt = now;
  }

  noteOutput(data: string, now: number): void {
    // A new burst after a quiet gap is a redraw: judge the screen by it alone.
    if (this.lastOutputAt !== null && now - this.lastOutputAt >= this.opts.quietMs) {
      this.tail = "";
    }
    this.lastOutputAt = now;
    this.tail = (this.tail + data).slice(-TAIL_MAX);
  }

  decide(now: number): InitialInputDecision {
    const elapsed = now - this.startedAt;
    const dialog = looksLikeBlockingDialog(this.tail);
    if (dialog) return elapsed >= this.opts.dialogTimeoutMs ? "give-up" : "wait";
    if (elapsed < this.opts.minDelayMs) return "wait";
    if (elapsed >= this.opts.maxWaitMs) return "fire";
    if (this.lastOutputAt === null) return "wait";
    return now - this.lastOutputAt >= this.opts.quietMs ? "fire" : "wait";
  }
}

/**
 * Bracketed paste of `text`: newlines become CR (what a terminal sends for a pasted
 * newline) and ESC is stripped so the text cannot end the paste early.
 */
export function bracketedPaste(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\x1b/g, "").replace(/\r\n?|\n/g, "\r");
  return `\x1b[200~${clean}\x1b[201~`;
}
