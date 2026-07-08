import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  canonicalToolId,
  formatInstallCommand,
  getToolInstallSpec,
  toolInstallRunnable,
} from "../../tools.js";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { toolLabel } from "../utils";
import { installPlatform } from "../utils/install-platform";
import { useLocale } from "../i18n/LocaleProvider";

export function ToolInstallPanel({
  tool,
  compact = false,
  onInstalled,
}: {
  tool: string;
  compact?: boolean;
  onInstalled?: () => void;
}) {
  const { t } = useLocale();
  const spec = getToolInstallSpec(tool, installPlatform());
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!spec) {
    return (
      <p className="text-[13px] text-text-tertiary">{t("inventory.install.noRecipe")}</p>
    );
  }

  const display = formatInstallCommand(spec);
  const runnable = toolInstallRunnable(spec);

  const copy = async () => {
    const ok = await writeClipboardText(display);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runInstall = async () => {
    setInstalling(true);
    setResult(null);
    try {
      const res = await window.api.runInstall(canonicalToolId(tool));
      setResult(res);
      if (res.success) onInstalled?.();
    } catch {
      setResult({ success: false, message: t("inventory.install.failedUnexpected") });
    } finally {
      setInstalling(false);
    }
  };

  const openWebsite = () => {
    if (spec.url) void window.api.openExternal(spec.url);
  };

  if (compact) {
    return (
      <div className="text-[13px]">
        <div className="flex items-center gap-2 py-1">
          <span className="w-5 text-center">✗</span>
          <strong>{toolLabel(tool)}</strong>: {t("inventory.overview.notInPath")}
          {spec.url && (
            <button
              type="button"
              onClick={openWebsite}
              className="ml-1 cursor-pointer text-accent underline-offset-2 hover:underline"
            >
              {t("inventory.overview.website")}
            </button>
          )}
        </div>
        <div className="ml-7 mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-secondary">{t("inventory.overview.install")}</span>
          <code className="min-w-0 flex-1 rounded bg-bg-secondary px-2 py-1 font-mono text-[11px] text-text-primary">
            {display}
          </code>
          {runnable && (
            <Button size="sm" variant="default" onClick={() => void runInstall()} disabled={installing}>
              {installing ? t("inventory.install.installing") : t("inventory.install.runInstall")}
            </Button>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            className="cursor-pointer rounded border border-border px-2 py-1 text-[11px] text-text-secondary transition-all hover:border-accent hover:text-accent"
          >
            {copied ? t("inventory.overview.copied") : t("inventory.overview.copy")}
          </button>
          {spec.url && !runnable && (
            <Button size="sm" variant="outline" onClick={openWebsite}>
              {t("inventory.install.openWebsite")}
            </Button>
          )}
        </div>
        {result && (
          <p className={`ml-7 mt-1 text-[11px] ${result.success ? "text-ok" : "text-fail"}`}>
            {result.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-text-secondary">{t("inventory.install.notInPathHint", { tool: toolLabel(tool) })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded bg-bg-secondary px-2 py-1.5 font-mono text-[11px] text-text-primary">
          {display}
        </code>
        {runnable && (
          <Button size="sm" onClick={() => void runInstall()} disabled={installing}>
            {installing ? t("inventory.install.installing") : t("inventory.install.runInstall")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? t("inventory.overview.copied") : t("inventory.overview.copy")}
        </Button>
        {spec.url && (
          <Button size="sm" variant="outline" onClick={openWebsite}>
            {t("inventory.install.openWebsite")}
          </Button>
        )}
      </div>
      {result && (
        <p className={result.success ? "text-ok" : "text-fail"}>{result.message}</p>
      )}
      {result?.success && (
        <p className="text-[11px] text-text-tertiary">{t("inventory.install.rescanHint")}</p>
      )}
    </div>
  );
}
