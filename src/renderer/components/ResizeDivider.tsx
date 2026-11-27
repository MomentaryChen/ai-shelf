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
}

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

  return (
    <div
      ref={dividerRef}
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      className={`group relative z-20 touch-none select-none ${
        horizontal
          ? "flex h-full w-full min-w-0 cursor-col-resize items-stretch justify-center"
          : "flex h-full w-full min-h-0 cursor-row-resize flex-col items-stretch justify-center"
      }`}
    >
      <div
        className={`m-auto rounded-full bg-chrome-border-strong transition-colors group-hover:bg-chrome-text-subtle group-active:bg-accent ${
          horizontal ? "h-12 w-0.5" : "h-0.5 w-12"
        }`}
      />
    </div>
  );
}
