/**
 * Watch `devicePixelRatio`. Dragging a window to a monitor with another scale
 * changes DPR while the CSS size of the pane often stays the same, so neither
 * ResizeObserver nor `resize` fires. xterm re-rasterizes glyphs on its own,
 * but the cell width in CSS pixels shifts with DPR rounding, so cols/rows and
 * the PTY size need a fresh fit.
 *
 * A resolution query only matches one DPR, so it is replaced after each change.
 */

type MediaQueryListLike = {
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
};

export type DprWindowLike = {
  devicePixelRatio: number;
  matchMedia: (query: string) => MediaQueryListLike;
};

export function watchDevicePixelRatio(
  win: DprWindowLike,
  onChange: (dpr: number) => void,
): () => void {
  let current = win.devicePixelRatio;
  let query: MediaQueryListLike | null = null;
  let disposed = false;

  const listen = () => {
    query = win.matchMedia(`(resolution: ${current}dppx)`);
    query.addEventListener("change", handleChange);
  };

  function handleChange() {
    if (disposed) return;
    query?.removeEventListener("change", handleChange);
    query = null;
    const next = win.devicePixelRatio;
    const changed = next !== current;
    current = next;
    listen();
    if (changed) onChange(next);
  }

  listen();

  return () => {
    disposed = true;
    query?.removeEventListener("change", handleChange);
    query = null;
  };
}
