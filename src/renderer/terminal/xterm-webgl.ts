import type { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

/**
 * Attach the WebGL renderer when available. The addon is loaded on demand so
 * it stays out of the main xterm chunk. On context loss or activation failure,
 * dispose the addon so xterm falls back to the default canvas path.
 */
export function attachTerminalWebgl(term: Terminal): () => void {
  let addon: WebglAddon | null = null;
  let cancelled = false;

  void import("@xterm/addon-webgl")
    .then(({ WebglAddon: WebglAddonCtor }) => {
      if (cancelled) return;
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
        });
        if (cancelled) {
          instance.dispose();
          return;
        }
        term.loadAddon(instance);
        if (cancelled) {
          instance.dispose();
          return;
        }
        addon = instance;
      } catch (err) {
        console.warn("[xterm-webgl] falling back to canvas renderer", err);
        try {
          instance?.dispose();
        } catch {
          /* ignore */
        }
        if (addon === instance) addon = null;
      }
    })
    .catch((err) => {
      console.warn("[xterm-webgl] falling back to canvas renderer", err);
    });

  return () => {
    cancelled = true;
    if (!addon) return;
    try {
      addon.dispose();
    } catch {
      /* terminal may already be disposed */
    }
    addon = null;
  };
}
