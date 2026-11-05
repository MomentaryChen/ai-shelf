import type { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

/**
 * Attach the WebGL renderer when available. The addon is loaded on demand so
 * it stays out of the main xterm chunk. On context loss or activation failure,
 * dispose the addon so xterm falls back to the default canvas path.
 */
export function attachTerminalWebgl(term: Terminal, onRendererChange?: () => void): () => void {
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
          // Canvas metrics differ from WebGL; the pane must fit again or rows smear.
          onRendererChange?.();
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
