import { useCallback, useEffect, useRef } from "react";
import { rawRatioFromPointer } from "../terminal/split-resize";

type Orientation = "horizontal" | "vertical";

interface RatioProps {
  mode: "ratio";
  orientation: Orientation;
  /**
   * Live drag preview, at most once per animation frame. Gets the raw
   * (unclamped) pointer ratio and the split container size on the split axis.
   * Meant for direct DOM writes — setting React state here re-renders per frame.
   */
  onResizePreview: (rawRatio: number, containerPx: number) => void;
  /** Drag released: final raw ratio. Not called when the pointer never moved. */
  onResizeCommit: (rawRatio: number, containerPx: number) => void;
  /** Drag aborted (pointercancel / lost capture / unmount): undo the preview. */
  onResizeCancel: () => void;
  /** Current (committed) ratio of the first side: aria-valuenow and keyboard steps. */
  ratio: number;
  /** Accessible name of the separator. */
  ariaLabel: string;
  /** Double-click / Enter / `=`: even out the row or column. Omitted = no-op. */
  onEqualize?: () => void;
}

/** Arrow-key step on a focused ratio divider; Shift = fine step. */
export const DIVIDER_KEY_STEP = 0.05;
export const DIVIDER_KEY_STEP_FINE = 0.01;

interface DeltaProps {
  mode: "delta";
  orientation: Orientation;
  onResize: (deltaPx: number) => void;
}

type Props = RatioProps | DeltaProps;

/** Draggable divider — ratio mode splits panes; delta mode adjusts a fixed pixel size (e.g. sidebar). */
export function ResizeDivider(props: Props) {
  const dividerRef = useRef<HTMLDivElement>(null);
  const horizontal = props.orientation === "horizontal";
  // Latest props for listeners attached at pointerdown (the parent may
  // re-render mid-drag with new callbacks / basis values).
  const propsRef = useRef(props);
  propsRef.current = props;
  /** Aborts the drag in progress, if any (used on unmount). */
  const abortDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => abortDragRef.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const el = dividerRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);

      const setDragCursor = (on: boolean) => {
        document.body.style.cursor = on ? (horizontal ? "col-resize" : "row-resize") : "";
        document.body.style.userSelect = on ? "none" : "";
      };

      if (propsRef.current.mode === "ratio") {
        // Divider sits in a narrow wrapper; measure the full split container (grandparent).
        const splitContainer = el.parentElement?.parentElement ?? el.parentElement;
        if (!splitContainer) return;

        let frame = 0;
        let latest: { ratio: number; size: number } | null = null;

        const measure = (ev: PointerEvent) => {
          const rect = splitContainer.getBoundingClientRect();
          const size = horizontal ? rect.width : rect.height;
          const pos = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top;
          const ratio = rawRatioFromPointer(pos, size);
          return ratio === null ? null : { ratio, size };
        };

        const flushPreview = () => {
          frame = 0;
          const p = propsRef.current;
          if (latest && p.mode === "ratio") p.onResizePreview(latest.ratio, latest.size);
        };

        const onMove = (ev: PointerEvent) => {
          const m = measure(ev);
          if (!m) return;
          latest = m;
          if (!frame) frame = requestAnimationFrame(flushPreview);
        };

        const finish = (outcome: "commit" | "cancel", ev?: PointerEvent) => {
          abortDragRef.current = null;
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onCancel);
          el.removeEventListener("lostpointercapture", onCancel);
          if (ev && el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
          setDragCursor(false);

          const p = propsRef.current;
          if (p.mode !== "ratio" || !latest) return; // never moved: nothing to commit or undo
          if (outcome === "commit") {
            const m = (ev && measure(ev)) ?? latest;
            p.onResizeCommit(m.ratio, m.size);
          } else {
            p.onResizeCancel();
          }
        };

        const onUp = (ev: PointerEvent) => finish("commit", ev);
        const onCancel = (ev: PointerEvent) => finish("cancel", ev);

        abortDragRef.current = () => finish("cancel");
        setDragCursor(true);
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onCancel);
        el.addEventListener("lostpointercapture", onCancel);
        return;
      }

      let lastX = e.clientX;
      let lastY = e.clientY;

      const onMove = (ev: PointerEvent) => {
        const delta = horizontal ? ev.clientX - lastX : ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        const p = propsRef.current;
        if (delta !== 0 && p.mode === "delta") p.onResize(delta);
      };

      const onEnd = (ev: PointerEvent) => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onEnd);
        el.removeEventListener("pointercancel", onEnd);
        setDragCursor(false);
      };

      setDragCursor(true);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onEnd);
      el.addEventListener("pointercancel", onEnd);
    },
    [horizontal],
  );

  /**
   * Ratio mode keyboard: arrows along the split axis move by 5% (Shift: 1%),
   * Home / End jump to the limits, Enter / `=` equalize. Every press commits
   * once through `onResizeCommit`, so the pixel clamp applies like a drag.
   * Modified presses (Ctrl / Alt / Meta) are left to the global pane shortcuts.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const p = propsRef.current;
    if (p.mode !== "ratio" || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = dividerRef.current;
    const splitContainer = el?.parentElement?.parentElement ?? el?.parentElement;
    if (!splitContainer) return;
    const step = e.shiftKey ? DIVIDER_KEY_STEP_FINE : DIVIDER_KEY_STEP;
    const [dec, inc] = horizontal ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    let next: number | null = null;
    switch (e.key) {
      case dec:
        next = p.ratio - step;
        break;
      case inc:
        next = p.ratio + step;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      case "Enter":
      case "=":
        e.preventDefault();
        e.stopPropagation();
        p.onEqualize?.();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = splitContainer.getBoundingClientRect();
    p.onResizeCommit(next, horizontal ? rect.width : rect.height);
  };

  const ratioProps =
    props.mode === "ratio"
      ? {
          tabIndex: 0,
          "aria-label": props.ariaLabel,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": Math.round(props.ratio * 100),
          onKeyDown,
          // Mouse drags / double-clicks must not pull focus off the terminal;
          // the divider takes focus from Tab only.
          onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
          onDoubleClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            const p = propsRef.current;
            if (p.mode === "ratio") p.onEqualize?.();
          },
        }
      : {};

  return (
    <div
      ref={dividerRef}
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      {...ratioProps}
      className={`group relative z-20 touch-none select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chrome-ui-accent/60 ${
        horizontal
          ? "flex h-full w-full min-w-0 cursor-col-resize items-stretch justify-center"
          : "flex h-full w-full min-h-0 cursor-row-resize flex-col items-stretch justify-center"
      }`}
    >
      <div
        className={`m-auto rounded-full bg-chrome-border-strong transition-colors group-hover:bg-chrome-text-subtle group-focus-visible:bg-accent group-active:bg-accent ${
          horizontal ? "h-12 w-0.5" : "h-0.5 w-12"
        }`}
      />
    </div>
  );
}
