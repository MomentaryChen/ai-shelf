import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const paneShellClass =
  "min-h-[320px] h-[min(60vh,520px)] resize-y overflow-auto rounded-[22px] border border-border bg-bg-primary px-4 py-3";

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

type Props = {
  label: string;
  fullscreenTitle: string;
  empty?: boolean;
  emptyFallback?: ReactNode;
  children: ReactNode;
};

function PreviewZoomBody({
  zoom,
  children,
  className = "",
}: {
  zoom: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-h-[1.5rem] origin-top-left ${className}`}
      style={{ zoom }}
    >
      {children}
    </div>
  );
}

function ZoomToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFullscreen,
  fullscreenDisabled,
  showFullscreen = true,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFullscreen: () => void;
  fullscreenDisabled?: boolean;
  showFullscreen?: boolean;
}) {
  const { t } = useLocale();
  const percent = Math.round(zoom * 100);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomOut}
        disabled={zoom <= ZOOM_MIN}
        className="h-8 w-8 px-0"
        title={t("tools.preview.zoomOut")}
        aria-label={t("tools.preview.zoomOut")}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span
        className="hidden min-w-[2.75rem] text-center text-[11px] tabular-nums text-text-tertiary @sm:inline"
        title={t("tools.preview.zoomLevel", { percent })}
      >
        {t("tools.preview.zoomLevel", { percent })}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomIn}
        disabled={zoom >= ZOOM_MAX}
        className="h-8 w-8 px-0"
        title={t("tools.preview.zoomIn")}
        aria-label={t("tools.preview.zoomIn")}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomReset}
        disabled={zoom === 1}
        className="h-8 w-8 px-0"
        title={t("tools.preview.zoomReset")}
        aria-label={t("tools.preview.zoomReset")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      {showFullscreen && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onFullscreen}
          disabled={fullscreenDisabled}
          className="h-8 px-2 text-[12px]"
          title={t("tools.preview.fullscreen")}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden @md:inline">{t("tools.preview.fullscreen")}</span>
        </Button>
      )}
    </div>
  );
}

export function ToolsPreviewPane({
  label,
  fullscreenTitle,
  empty = false,
  emptyFallback,
  children,
}: Props) {
  const { t } = useLocale();
  const labelId = useId();
  const [zoom, setZoom] = useState(1);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  const onWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => clampZoom(z + delta));
  }, []);

  useEffect(() => {
    if (empty) setFullscreenOpen(false);
  }, [empty]);

  const showContent = !empty;
  const body = showContent ? children : emptyFallback;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-8 min-w-0 items-center justify-between gap-2">
          <Label id={labelId} className="text-[12px] font-medium text-text-secondary">
            {label}
          </Label>
          <ZoomToolbar
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={zoomReset}
            onFullscreen={() => setFullscreenOpen(true)}
            fullscreenDisabled={!showContent}
          />
        </div>
        <div
          role="region"
          aria-labelledby={labelId}
          className={`${paneShellClass} ${showContent ? "cursor-zoom-in" : ""}`}
          onWheel={showContent ? onWheel : undefined}
          onDoubleClick={() => {
            if (showContent) setFullscreenOpen(true);
          }}
          title={showContent ? t("tools.preview.fullscreenHint") : undefined}
        >
          {showContent ? (
            <PreviewZoomBody zoom={zoom}>{body}</PreviewZoomBody>
          ) : (
            body
          )}
        </div>
        {showContent && (
          <p className="text-[11px] text-text-tertiary">{t("tools.preview.resizeHint")}</p>
        )}
      </div>

      <Dialog open={fullscreenOpen && showContent} onOpenChange={setFullscreenOpen}>
        <DialogContent
          className="flex max-h-[min(96vh,920px)] max-w-[min(96vw,1200px)] flex-col gap-3 border-border bg-bg-card p-4 text-text-primary"
          aria-describedby={undefined}
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle className="min-w-0 truncate text-[15px] font-semibold text-text-primary">
              {fullscreenTitle}
            </DialogTitle>
            <ZoomToolbar
              zoom={zoom}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomReset={zoomReset}
              onFullscreen={() => setFullscreenOpen(false)}
              showFullscreen={false}
            />
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-auto rounded-[22px] bg-bg-primary p-4"
            onWheel={onWheel}
          >
            <PreviewZoomBody zoom={zoom}>{children}</PreviewZoomBody>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
