import { useLayoutEffect, useRef, useState } from "react";
import { directionBetween, type SlideDirection } from "../utils/workspace-slide";

/**
 * Direction of the latest id change, plus an epoch that increments on each
 * animated change so repeated directions can restart CSS animations.
 * The first id (startup restore) does not animate.
 */
export function useSlideDirection(
  id: string | null,
  items: readonly { id: string }[],
  /** Set before an id change to force wheel-wrap direction. Cleared after use. */
  preferredRef?: { current: SlideDirection | null },
): { direction: SlideDirection | null; epoch: number } {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const prevId = useRef(id);
  const [motion, setMotion] = useState<{ direction: SlideDirection | null; epoch: number }>({
    direction: null,
    epoch: 0,
  });

  useLayoutEffect(() => {
    if (prevId.current === id) return;
    const preferred = preferredRef?.current ?? null;
    if (preferredRef) preferredRef.current = null;
    const direction = preferred ?? directionBetween(itemsRef.current, prevId.current, id);
    prevId.current = id;
    setMotion((prev) => ({
      direction,
      epoch: direction ? prev.epoch + 1 : prev.epoch,
    }));
  }, [id, preferredRef]);

  return motion;
}
