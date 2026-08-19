import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { ChevronLeft, ChevronRight, FolderKanban } from "lucide-react";
import { useLocale } from "../i18n/LocaleProvider";
import { groupIndexById, stepIndex } from "../utils/workspace-slide";

const SWIPE_PX = 40;
const WHEEL_LOCK_MS = 280;
const MAX_DOTS = 8;

export interface WorkspaceSlideGroup {
  id: string;
  name: string;
  icon?: ReactNode;
}

interface WorkspaceSlideSwitcherProps {
  groups: WorkspaceSlideGroup[];
  currentGroupId: string;
  collapsed?: boolean;
  onGroupChange?: (groupId: string) => void;
}

export function WorkspaceSlideSwitcher({
  groups,
  currentGroupId,
  collapsed = false,
  onGroupChange,
}: WorkspaceSlideSwitcherProps) {
  const { t } = useLocale();
  const hintId = useId();
  const index = groupIndexById(groups, currentGroupId);
  const current = groups[index];
  const count = Math.max(groups.length, 1);
  const canPrev = index > 0;
  const canNext = index < groups.length - 1;
  const emptyLabel = t("workspace.empty");
  const slides = groups.length > 0 ? groups : [{ id: "", name: emptyLabel }];

  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const startX = useRef<number | null>(null);
  const wheelLock = useRef(false);
  const wheelTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(wheelTimer.current), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      const id = groups[nextIndex]?.id;
      if (!id || id === currentGroupId) return;
      onGroupChange?.(id);
    },
    [currentGroupId, groups, onGroupChange],
  );

  const go = useCallback(
    (delta: number) => {
      goToIndex(stepIndex(groups.length, index, delta));
    },
    [goToIndex, groups.length, index],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || groups.length < 2) return;
    startX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    let dx = e.clientX - startX.current;
    if (!canPrev && dx > 0) dx *= 0.28;
    if (!canNext && dx < 0) dx *= 0.28;
    setDragPx(dx);
  };

  const finishDrag = (clientX: number) => {
    if (startX.current == null) return;
    const dx = clientX - startX.current;
    startX.current = null;
    setDragging(false);
    setDragPx(0);
    if (dx <= -SWIPE_PX) go(1);
    else if (dx >= SWIPE_PX) go(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goToIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goToIndex(groups.length - 1);
    }
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (groups.length < 2 || wheelLock.current) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    wheelLock.current = true;
    go(e.deltaX > 0 ? 1 : -1);
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelLock.current = false;
    }, WHEEL_LOCK_MS);
  };

  const trackStyle = useMemo(
    () => ({
      width: `${count * 100}%`,
      transform: `translateX(calc(${(-index / count) * 100}% + ${dragPx}px))`,
      transition: dragging || reduceMotion ? "none" : "transform 200ms ease",
    }),
    [count, dragPx, dragging, index, reduceMotion],
  );

  const name = current?.name ?? emptyLabel;
  const position = t("workspace.position", {
    current: groups.length === 0 ? 0 : index + 1,
    total: groups.length,
  });

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5" role="group" aria-label={t("workspace.groupSwitcher")}>
        <SlideArrow direction="prev" disabled={!canPrev} label={t("workspace.prev")} onClick={() => go(-1)} />
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-chrome-text"
          title={name}
          aria-live="polite"
        >
          {current?.icon ?? <FolderKanban className="h-4 w-4" />}
        </div>
        <SlideArrow direction="next" disabled={!canNext} label={t("workspace.next")} onClick={() => go(1)} />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-chrome-border-input bg-chrome-surface px-1 py-1"
      role="group"
      aria-label={t("workspace.groupSwitcher")}
      aria-describedby={hintId}
    >
      <div className="flex items-center gap-0.5">
        <SlideArrow direction="prev" disabled={!canPrev} label={t("workspace.prev")} onClick={() => go(-1)} />
        <div
          className="min-w-0 flex-1 cursor-grab overflow-hidden touch-pan-y select-none active:cursor-grabbing"
          tabIndex={0}
          role="slider"
          aria-orientation="horizontal"
          aria-valuemin={groups.length === 0 ? 0 : 1}
          aria-valuemax={groups.length}
          aria-valuenow={groups.length === 0 ? 0 : index + 1}
          aria-valuetext={name}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishDrag(e.clientX)}
          onPointerCancel={() => {
            startX.current = null;
            setDragging(false);
            setDragPx(0);
          }}
          onWheel={onWheel}
          title={t("workspace.slideHint")}
        >
          <div className="flex" style={trackStyle}>
            {slides.map((group) => (
              <div
                key={group.id || "empty"}
                className="flex min-h-9 shrink-0 items-center gap-2 px-1 py-1"
                style={{ width: `${100 / count}%` }}
              >
                <span className="shrink-0 text-chrome-text">
                  {group.icon ?? <FolderKanban className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1 truncate text-sm text-chrome-text">{group.name}</div>
              </div>
            ))}
          </div>
        </div>
        <SlideArrow direction="next" disabled={!canNext} label={t("workspace.next")} onClick={() => go(1)} />
      </div>
      {groups.length > 1 && groups.length <= MAX_DOTS ? (
        <div className="flex flex-wrap items-center justify-center pb-0.5">
          {groups.map((group, i) => (
            <button
              key={group.id}
              type="button"
              tabIndex={-1}
              aria-label={group.name}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goToIndex(i)}
              className="flex h-9 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-border-focus"
            >
              <span
                className={`block rounded-full transition-all duration-200 ${
                  i === index
                    ? "h-1.5 w-3.5 bg-chrome-text"
                    : "h-1.5 w-1.5 bg-chrome-text-muted/50"
                }`}
              />
            </button>
          ))}
        </div>
      ) : (
        <div
          className="truncate px-1 pb-0.5 text-center text-[11px] tabular-nums text-chrome-text-muted"
          aria-live="polite"
        >
          {groups.length > 1 ? position : t("workspace.groupSwitcher")}
        </div>
      )}
      <span id={hintId} className="sr-only">
        {t("workspace.slideHint")}
      </span>
    </div>
  );
}

function SlideArrow({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-chrome-text-muted transition-all duration-200 hover:bg-chrome-hover hover:text-chrome-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-border-focus disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
