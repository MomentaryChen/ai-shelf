import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppMode } from "./AppModeSwitch";
import { ToolLogo } from "./ToolLogo";
import { AuthBadgeForEntry } from "./Badge";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import type { McpRawData, ProviderEntry } from "../types";
import { toolLabel } from "../utils";
import { profileCreateDefaults } from "../utils/profile-templates";
import { profileToolChoices, toolIdsFromInventory } from "../utils/available-tools";
import {
  computeMcpSyncGaps,
  countProfiles,
  getAuthGaps,
  getInstalledEntries,
  mcpSyncPayloadFromGaps,
} from "../utils/onboarding-analysis";
import { notifyProfilesChanged } from "../utils/profile-events";

type Step = 1 | 2 | 3;

const STEP_LABEL_KEYS: MessageKey[] = [
  "onboarding.step.detect",
  "onboarding.step.connect",
  "onboarding.step.start",
];

const MODE_CARDS: { mode: AppMode; icon: string; key: MessageKey }[] = [
  { mode: "terminal", icon: "🖥️", key: "onboarding.start.modeTerminal" },
  { mode: "inventory", icon: "📦", key: "onboarding.start.modeInventory" },
  { mode: "tools", icon: "🔧", key: "onboarding.start.modeTools" },
  { mode: "flow", icon: "🧭", key: "onboarding.start.modeFlow" },
];

export function OnboardingModal({
  open,
  data,
  onComplete,
  onSwitchMode,
}: {
  open: boolean;
  data: ProviderEntry[];
  onComplete: () => void;
  onSwitchMode: (mode: AppMode) => void;
}) {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>(1);
  const [mcpRaw, setMcpRaw] = useState<McpRawData | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const installed = useMemo(() => getInstalledEntries(data), [data]);
  const authGaps = useMemo(() => getAuthGaps(data), [data]);
  const mcpGaps = useMemo(() => computeMcpSyncGaps(data, mcpRaw), [data, mcpRaw]);

  useEffect(() => {
    if (!open || step !== 2) return;
    let cancelled = false;
    setMcpLoading(true);
    void window.api
      .getMcpRaw()
      .then((raw) => {
        if (!cancelled) setMcpRaw(raw);
      })
      .catch(() => {
        if (!cancelled) setMcpRaw(null);
      })
      .finally(() => {
        if (!cancelled) setMcpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step]);

  const completeOnboarding = useCallback(async () => {
    await window.api.setOnboardingCompleted();
    onComplete();
  }, [onComplete]);

  const skip = useCallback(() => {
    void completeOnboarding();
  }, [completeOnboarding]);

  const syncMcpGaps = useCallback(async () => {
    const { serverNames, targetTools } = mcpSyncPayloadFromGaps(mcpGaps);
    if (serverNames.length === 0 || targetTools.length === 0) return;
    setSyncing(true);
    setSyncDone(false);
    try {
      await window.api.syncMcp({ serverNames, targetTools });
      const raw = await window.api.getMcpRaw();
      setMcpRaw(raw);
      setSyncDone(true);
    } finally {
      setSyncing(false);
    }
  }, [mcpGaps]);

  const finish = useCallback(async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      const forestRes = await window.api.profileGroupGetForest();
      if (forestRes.success) {
        const forest = forestRes.forest;
        if (countProfiles(forest) === 0) {
          const tools = profileToolChoices(toolIdsFromInventory(data));
          const defaults = profileCreateDefaults("template-solo", [], null, tools);
          const created = await window.api.profileCreate(t("onboarding.profileName"), {
            defaultTool: defaults.defaultTool,
            defaultCwd: defaults.defaultCwd,
            broadcastInput: defaults.broadcastInput,
            accentColor: defaults.accentColor,
          });
          if (!created.success) {
            setFinishError(created.error ?? t("onboarding.start.createFailed"));
            return;
          }
          notifyProfilesChanged();
        }
      }
      await completeOnboarding();
      onSwitchMode("terminal");
    } finally {
      setFinishing(false);
    }
  }, [completeOnboarding, data, onSwitchMode, t]);

  const stepTitle =
    step === 1
      ? t("onboarding.welcome.title")
      : step === 2
        ? t("onboarding.connect.title")
        : t("onboarding.start.title");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) skip();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(92vh,40rem)] max-w-lg flex-col gap-0 overflow-hidden border-sand bg-[var(--cream)] p-0 text-[var(--ink)] warm-shadow-card"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-sand px-6 py-4">
          <div className="mb-3 flex items-center justify-center gap-2">
            {STEP_LABEL_KEYS.map((key, i) => {
              const n = (i + 1) as Step;
              const active = step === n;
              const done = step > n;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-[var(--clay)] text-white"
                        : done
                          ? "bg-[var(--sand)] text-[var(--ink)]"
                          : "bg-[var(--sand-deep)] text-[var(--muted)]"
                    }`}
                  >
                    {done ? "✓" : n}
                  </span>
                  {i < STEP_LABEL_KEYS.length - 1 && (
                    <span className="h-px w-6 bg-sand" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
          <DialogTitle className="text-center text-[17px] font-semibold text-[var(--ink)]">
            {stepTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="flex flex-col gap-4 warm-rise">
              <p className="text-center text-[15px] leading-normal text-[var(--ink)]">
                {installed.length > 0
                  ? t("onboarding.welcome.subtitle", { count: installed.length })
                  : t("onboarding.welcome.none")}
              </p>
              {installed.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {installed.map((entry) => (
                    <div
                      key={entry.tool}
                      className="flex items-center gap-2.5 rounded-[22px] bg-[var(--surface)] px-3 py-2.5 warm-shadow-card"
                    >
                      <ToolLogo tool={entry.tool} size={22} />
                      <div className="min-w-0 text-left">
                        <p className="truncate text-[13px] font-medium text-[var(--ink)]">
                          {toolLabel(entry.tool)}
                        </p>
                        <p className="text-[11px] text-[var(--muted)]">
                          {t("onboarding.welcome.installed")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[22px] bg-[var(--sand)] px-4 py-3 text-center text-[13px] text-[var(--ink)]">
                  {t("onboarding.welcome.noneHint")}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-[15px] leading-normal text-[var(--ink)]">
                {t("onboarding.connect.subtitle")}
              </p>

              {authGaps.length > 0 && (
                <section className="rounded-[22px] bg-[var(--surface)] p-4 warm-shadow-card">
                  <h3 className="mb-2 text-[13px] font-medium text-[var(--ink)]">
                    {t("onboarding.connect.authTitle")}
                  </h3>
                  <p className="mb-3 text-[13px] leading-normal text-[var(--muted)]">
                    {t("onboarding.connect.authHint")}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {authGaps.map((entry) => (
                      <li
                        key={entry.tool}
                        className="flex items-center justify-between gap-2 rounded-[16px] bg-[var(--cream)] px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
                          <ToolLogo tool={entry.tool} size={18} />
                          {toolLabel(entry.tool)}
                        </span>
                        <AuthBadgeForEntry entry={entry} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {mcpLoading ? (
                <p className="text-center text-[13px] text-[var(--muted)]">
                  {t("onboarding.connect.mcpLoading")}
                </p>
              ) : mcpGaps.length > 0 ? (
                <section className="rounded-[22px] bg-[var(--surface)] p-4 warm-shadow-card">
                  <h3 className="mb-2 text-[13px] font-medium text-[var(--ink)]">
                    {t("onboarding.connect.mcpTitle")}
                  </h3>
                  <p className="mb-3 text-[13px] leading-normal text-[var(--muted)]">
                    {t("onboarding.connect.mcpHint", { count: mcpGaps.length })}
                  </p>
                  <ul className="mb-3 max-h-32 overflow-y-auto text-[12px] text-[var(--ink)]">
                    {mcpGaps.map((gap) => (
                      <li key={gap.serverName} className="border-t border-sand py-1.5 first:border-none">
                        <span className="font-medium">{gap.serverName}</span>
                        <span className="text-[var(--muted)]">
                          {" "}
                          → {gap.missingIn.join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    disabled={syncing}
                    onClick={() => void syncMcpGaps()}
                    className="w-full rounded-[22px] border-0 bg-gradient-to-br from-[var(--clay-soft)] to-[var(--clay)] text-white shadow-[var(--shadow-accent)] hover:from-[var(--clay)] hover:to-[var(--clay-deep)]"
                  >
                    {syncing ? t("onboarding.connect.syncing") : t("onboarding.connect.syncAll")}
                  </Button>
                  {syncDone && (
                    <p className="mt-2 text-center text-[12px] text-[var(--success)]">
                      {t("onboarding.connect.syncDone")}
                    </p>
                  )}
                </section>
              ) : null}

              {authGaps.length === 0 && !mcpLoading && mcpGaps.length === 0 && (
                <p className="rounded-[22px] bg-[var(--sand)] px-4 py-3 text-center text-[13px] text-[var(--ink)]">
                  {t("onboarding.connect.allGood")}
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4 warm-rise">
              <p className="text-[15px] leading-normal text-[var(--ink)]">
                {t("onboarding.start.subtitle")}
              </p>
              {finishError && (
                <p className="rounded-[22px] bg-[var(--sand)] px-4 py-3 text-center text-[13px] text-[var(--ink)]">
                  {finishError}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <h3 className="text-[13px] font-medium text-[var(--ink)]">
                  {t("onboarding.start.modesTitle")}
                </h3>
                {MODE_CARDS.map(({ mode, icon, key }) => (
                  <div
                    key={mode}
                    className="flex items-start gap-3 rounded-[22px] bg-[var(--surface)] px-4 py-3 warm-shadow-card"
                  >
                    <span className="text-xl" aria-hidden>
                      {icon}
                    </span>
                    <p className="text-[13px] leading-normal text-[var(--ink)]">{t(key)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t border-sand px-6 py-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={skip}
            className="cursor-pointer text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            {t("onboarding.skip")}
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded-[22px] border-sand bg-transparent text-[var(--ink)]"
              >
                {t("onboarding.back")}
              </Button>
            )}
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="rounded-[22px] border-0 bg-gradient-to-br from-[var(--clay-soft)] to-[var(--clay)] text-white shadow-[var(--shadow-accent)]"
              >
                {t("onboarding.next")}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={finishing}
                onClick={() => void finish()}
                className="rounded-[22px] border-0 bg-gradient-to-br from-[var(--clay-soft)] to-[var(--clay)] text-white shadow-[var(--shadow-accent)]"
              >
                {finishing ? t("onboarding.start.creating") : t("onboarding.start.getStarted")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
