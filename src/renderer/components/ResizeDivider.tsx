import { useCallback, useRef } from "react";

type Orientation = "horizontal" | "vertical";

interface RatioProps {
  mode: "ratio";
  orientation: Orientation;
  onResize: (ratio: number) => void;
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const el = dividerRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);

      if (props.mode === "ratio") {
        // Divider sits in a narrow wrapper; measure the full split container (grandparent).
        const splitContainer = el.parentElement?.parentElement ?? el.parentElement;
        if (!splitContainer) return;

        const onMove = (ev: PointerEvent) => {
          const rect = splitContainer.getBoundingClientRect();
          const size = horizontal ? rect.width : rect.height;
          if (size <= 0) return;
          const pos = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top;
          props.onResize(Math.min(0.9, Math.max(0.1, pos / size)));
        };

        const onEnd = (ev: PointerEvent) => {
          el.releasePointerCapture(ev.pointerId);
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onEnd);
          el.removeEventListener("pointercancel", onEnd);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };

        document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onEnd);
        el.addEventListener("pointercancel", onEnd);
        return;
      }

      let lastX = e.clientX;
      let lastY = e.clientY;

      const onMove = (ev: PointerEvent) => {
        const delta = horizontal ? ev.clientX - lastX : ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (delta !== 0) props.onResize(delta);
      };

      const onEnd = (ev: PointerEvent) => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onEnd);
        el.removeEventListener("pointercancel", onEnd);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onEnd);
      el.addEventListener("pointercancel", onEnd);
    },
    [horizontal, props],
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
