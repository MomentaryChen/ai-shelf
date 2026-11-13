import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[200] bg-bg-overlay backdrop-blur-sm",
        "ui-backdrop-enter data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/** Gap kept between a dialog and the window edge, in px. */
const DIALOG_EDGE_GAP = 8;

const DRAG_IGNORE_SELECTOR =
  "button, input, select, textarea, a, label, [role='button'], [contenteditable='true'], [data-no-dialog-drag]";

/**
 * Lets a centered dialog be dragged by its header (or its own padding) while
 * never leaving the window. The drag offset lives on the DOM node via the
 * `translate` property, so each newly opened dialog starts centered again.
 */
function useDraggableDialog() {
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  const offsetRef = React.useRef({ x: 0, y: 0 });
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const apply = React.useCallback((x: number, y: number) => {
    const node = nodeRef.current;
    if (!node) return;
    const prev = offsetRef.current;
    const rect = node.getBoundingClientRect();
    // Rect of the dialog in its centered (un-dragged) position.
    const baseLeft = rect.left - prev.x;
    const baseTop = rect.top - prev.y;
    const minX = DIALOG_EDGE_GAP - baseLeft;
    const maxX = window.innerWidth - DIALOG_EDGE_GAP - (baseLeft + rect.width);
    const minY = DIALOG_EDGE_GAP - baseTop;
    const maxY = window.innerHeight - DIALOG_EDGE_GAP - (baseTop + rect.height);
    const clampAxis = (v: number, min: number, max: number) =>
      max < min ? 0 : Math.min(Math.max(v, min), max);
    const next = { x: clampAxis(x, minX, maxX), y: clampAxis(y, minY, maxY) };
    offsetRef.current = next;
    node.style.translate = `${next.x}px ${next.y}px`;
  }, []);

  const lastNodeRef = React.useRef<HTMLDivElement | null>(null);

  const setNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node === nodeRef.current) return;
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      if (!node) return;
      // A freshly mounted dialog (new open) starts centered; a re-attached
      // node (ref callback identity change) keeps its dragged position.
      if (node !== lastNodeRef.current) offsetRef.current = { x: 0, y: 0 };
      lastNodeRef.current = node;
      const reclamp = () => apply(offsetRef.current.x, offsetRef.current.y);
      window.addEventListener("resize", reclamp);
      const ro = new ResizeObserver(reclamp);
      ro.observe(node);
      cleanupRef.current = () => {
        window.removeEventListener("resize", reclamp);
        ro.disconnect();
      };
    },
    [apply],
  );

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const node = nodeRef.current;
      const target = e.target as HTMLElement;
      if (!node) return;
      const onHandle =
        target === node ||
        (target.closest("[data-slot='dialog-header']") !== null &&
          target.closest(DRAG_IGNORE_SELECTOR) === null);
      if (!onHandle) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...offsetRef.current };
      const pointerId = e.pointerId;
      node.setPointerCapture(pointerId);
      const move = (ev: PointerEvent) => {
        apply(origin.x + ev.clientX - startX, origin.y + ev.clientY - startY);
      };
      const up = () => {
        if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
    },
    [apply],
  );

  return { setNode, onPointerDown };
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ref,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { setNode, onPointerDown: onDragPointerDown } = useDraggableDialog();
  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNode(node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [setNode, ref],
  );
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={mergedRef}
        data-slot="dialog-content"
        onPointerDown={(e) => {
          onPointerDown?.(e);
          if (!e.defaultPrevented) onDragPointerDown(e);
        }}
        className={cn(
          // Centered with inset + auto margins (no transform) so the dialog can
          // never be pushed past the top of the window; height is capped to the
          // viewport. Dragging adds a clamped `translate` offset on top.
          "ui-dialog-rise fixed inset-0 z-[201] m-auto grid h-fit max-h-[calc(100vh-1rem)] w-full max-w-md gap-4 rounded-xl border border-chrome-border bg-chrome-surface p-5 shadow-float",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-chrome-text-muted opacity-70 transition-opacity hover:bg-chrome-hover-strong hover:text-chrome-text hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex cursor-move flex-col gap-1.5 text-left select-none", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-sm font-semibold text-chrome-text", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-[12px] text-chrome-text-muted", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
