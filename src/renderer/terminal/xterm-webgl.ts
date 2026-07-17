import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

/**
 * Attach the WebGL renderer when available. On context loss or activation
 * failure, dispose the addon so xterm falls back to the default canvas path.
 */
export function attachTerminalWebgl(term: Terminal): () => void {
  let addon: WebglAddon | null = null;
  try {
    addon = new WebglAddon();
    addon.onContextLoss(() => {
      try {
        addon?.dispose();
      } catch {
        /* already torn down */
      }
      addon = null;
    });
    term.loadAddon(addon);
  } catch (err) {
    console.warn("[xterm-webgl] falling back to canvas renderer", err);
    try {
      addon?.dispose();
    } catch {
      /* ignore */
    }
    addon = null;
  }

  return () => {
    if (!addon) return;
    try {
      addon.dispose();
    } catch {
      /* terminal may already be disposed */
    }
    addon = null;
  };
}
