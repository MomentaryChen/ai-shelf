import { useCallback, useRef, useState } from "react";

/** Keeps content mounted briefly while a CSS exit animation runs. */
export function useDismissibleSurface<T>() {
  const [item, setItem] = useState<T | null>(null);
  const [exiting, setExiting] = useState(false);
  const itemRef = useRef<T | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (next: T) => {
      clearTimer();
      itemRef.current = next;
      setExiting(false);
      setItem(next);
    },
    [clearTimer],
  );

  const hide = useCallback(() => {
    if (!itemRef.current) return;
    clearTimer();
    setExiting(true);
    timerRef.current = window.setTimeout(() => {
      itemRef.current = null;
      setItem(null);
      setExiting(false);
      timerRef.current = null;
    }, 280);
  }, [clearTimer]);

  return { item, exiting, show, hide };
}
