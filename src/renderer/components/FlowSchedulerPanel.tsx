import { Button } from "@/components/ui/button";
import { useLocale } from "../i18n/LocaleProvider";

type TaskSchedulerStatus = {
  supported: boolean;
  installed: boolean;
  taskName: string;
};

type Props = {
  schedulerEnabled: boolean;
  schedulerSaving: boolean;
  onSchedulerToggle: () => void;
  taskScheduler: TaskSchedulerStatus | null;
  taskSchedulerBusy: boolean;
  onInstallTaskScheduler: () => void;
  onRemoveTaskScheduler: () => void;
};

export function FlowSchedulerPanel({
  schedulerEnabled,
  schedulerSaving,
  onSchedulerToggle,
  taskScheduler,
  taskSchedulerBusy,
  onInstallTaskScheduler,
  onRemoveTaskScheduler,
}: Props) {
  const { t } = useLocale();

  return (
    <section className="rounded-[20px] border border-border bg-bg-primary px-3 py-2.5">
      <div className="text-[12px] font-medium text-text-primary">{t("flow.scheduler.title")}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{t("flow.scheduler.hint")}</p>

      <label className="mt-2.5 flex cursor-pointer items-center gap-2 rounded-[18px] px-1 py-1.5 text-[12px] text-text-primary hover:bg-bg-elevated">
        <input
          type="checkbox"
          className="size-4 rounded accent-accent"
          checked={schedulerEnabled}
          disabled={schedulerSaving}
          onChange={onSchedulerToggle}
        />
        <span>{t("flow.scheduler.enabled")}</span>
      </label>

      {!schedulerEnabled && (
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{t("flow.scheduler.paused")}</p>
      )}

      {schedulerEnabled && taskScheduler?.supported && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-[12px] font-medium text-text-primary">{t("flow.taskScheduler.title")}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
            {t("flow.taskScheduler.hint")}
          </p>
          <p className="mt-2 text-[11px] text-text-secondary">
            {taskScheduler.installed
              ? t("flow.taskScheduler.installed", { name: taskScheduler.taskName })
              : t("flow.taskScheduler.notInstalled")}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {!taskScheduler.installed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full rounded-[22px] border-border text-[12px]"
                disabled={taskSchedulerBusy}
                onClick={onInstallTaskScheduler}
              >
                {taskSchedulerBusy ? t("flow.taskScheduler.installing") : t("flow.taskScheduler.install")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full rounded-[22px] border-border text-[12px]"
                disabled={taskSchedulerBusy}
                onClick={onRemoveTaskScheduler}
              >
                {taskSchedulerBusy ? t("flow.taskScheduler.removing") : t("flow.taskScheduler.remove")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
