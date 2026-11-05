import type { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

/** GPU is often still resetting in the instant after wake. */
const WEBGL_RECOVER_DELAY_MS = 700;

export type TerminalWebglHandle = {
  /** Drop WebGL immediately. xterm falls back to the canvas renderer. */
  dispose: () => void;
  /**
   * After sleep or a lost GPU process, the current context is stale and the
   * pane paints nothing. Drop it and try once more after the GPU settles.
   * A context loss does not retry on its own — that loops on machines with no
   * working WebGL.
   */
  recover: () => void;
};

/**
 * Attach the WebGL renderer when available. The addon is loaded on demand so
 * it stays out of the main xterm chunk. On context loss or activation failure,
 * dispose the addon so xterm falls back to the default canvas path.
 *
 * `onRendererChange` runs when the active renderer swaps. Cell size differs
 * between WebGL and canvas, so the pane has to fit again or rows smear.
 */
export function attachTerminalWebgl(
  term: Terminal,
  onRendererChange?: () => void,
): TerminalWebglHandle {
  let addon: WebglAddon | null = null;
  let cancelled = false;
  let generation = 0;
  let recoverTimer = 0;

  const detachCurrent = () => {
    const current = addon;
    addon = null;
    if (!current) return;
    try {
      current.dispose();
    } catch {
      /* already torn down */
    }
  };

  const mount = () => {
    const gen = ++generation;
    void import("@xterm/addon-webgl")
      .then(({ WebglAddon: WebglAddonCtor }) => {
        if (cancelled || gen !== generation) return;
        let instance: WebglAddon | null = null;
        try {
          instance = new WebglAddonCtor();
          instance.onContextLoss(() => {
            try {
              instance?.dispose();
            } catch {
              /* already torn down */
            }
            if (addon === instance) addon = null;
            onRendererChange?.();
          });
          if (cancelled || gen !== generation) {
            instance.dispose();
            return;
          }
          term.loadAddon(instance);
          if (cancelled || gen !== generation) {
            instance.dispose();
            return;
          }
          addon = instance;
          onRendererChange?.();
        } catch (err) {
          console.warn("[xterm-webgl] falling back to canvas renderer", err);
          try {
            instance?.dispose();
          } catch {
            /* ignore */
          }
          if (addon === instance) addon = null;
          onRendererChange?.();
        }
      })
      .catch((err) => {
        console.warn("[xterm-webgl] falling back to canvas renderer", err);
        onRendererChange?.();
      });
  };

  mount();

  return {
    recover() {
      if (cancelled) return;
      generation += 1;
      detachCurrent();
      onRendererChange?.();
      window.clearTimeout(recoverTimer);
      recoverTimer = window.setTimeout(() => {
        if (!cancelled) mount();
      }, WEBGL_RECOVER_DELAY_MS);
    },
    dispose() {
      cancelled = true;
      generation += 1;
      window.clearTimeout(recoverTimer);
      detachCurrent();
    },
  };
}
