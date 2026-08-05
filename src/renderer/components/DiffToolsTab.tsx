import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, Copy, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import {
  computeLineDiff,
  formatUnifiedDiff,
  MAX_DIFF_LINES,
  type DiffLine,
} from "../utils/diff-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

const fieldClass =
  "h-[220px] resize-none overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

function lineTone(type: DiffLine["type"]): string {
  if (type === "add") return "bg-ok/12 text-ok";
  if (type === "remove") return "bg-fail/12 text-fail";
  return "text-text-secondary";
}

function linePrefix(type: DiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "remove") return "−";
  return " ";
}

export function DiffToolsTab() {
  const { t } = useLocale();
  const leftId = useId();
  const rightId = useId();
  const copiedTimerRef = useRef<number | null>(null);

  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [copied, setCopied] = useState(false);

  const computed = useMemo(
    () => computeLineDiff(left, right, { ignoreWhitespace }),
    [left, right, ignoreWhitespace],
  );

  const unified = useMemo(() => {
    if (!computed.ok) return "";
    return formatUnifiedDiff(computed.result.lines);
  }, [computed]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const copyUnified = async () => {
    if (!unified) return;
    const ok = await writeClipboardText(unified);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  };

  const swap = () => {
    setLeft(right);
    setRight(left);
  };

  const hasInput = left.length > 0 || right.length > 0;
  const showEmptyHint = !hasInput;
  const identical = computed.ok && computed.result.identical && hasInput;

  return (
    <>
      <SectionHeading icon={GitCompare}>{t("tools.tab.diff")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("diff.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="flex cursor-pointer items-center gap-2 text-[13px] font-normal text-text-primary">
              <Checkbox
                checked={ignoreWhitespace}
                onCheckedChange={(v) => setIgnoreWhitespace(v === true)}
              />
              {t("diff.ignoreWhitespace")}
            </Label>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={swap}
                disabled={!hasInput}
                className="h-8 px-2 text-[12px]"
                title={t("diff.swap")}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span className="hidden @sm:inline">{t("diff.swap")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyUnified()}
                disabled={!unified || identical}
                title={copied ? t("diff.copied") : t("diff.copy")}
                className="h-8 px-2 text-[12px]"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="hidden @sm:inline">
                  {copied ? t("diff.copied") : t("diff.copy")}
                </span>
              </Button>
            </div>
          </div>

          <div className="grid items-start gap-3 @md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center">
                <Label htmlFor={leftId} className="text-[12px] font-medium text-text-secondary">
                  {t("diff.left")}
                </Label>
              </div>
              <Textarea
                id={leftId}
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                spellCheck={false}
                placeholder={t("diff.leftPlaceholder")}
                className={fieldClass}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center">
                <Label htmlFor={rightId} className="text-[12px] font-medium text-text-secondary">
                  {t("diff.right")}
                </Label>
              </div>
              <Textarea
                id={rightId}
                value={right}
                onChange={(e) => setRight(e.target.value)}
                spellCheck={false}
                placeholder={t("diff.rightPlaceholder")}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex h-8 min-w-0 items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-text-secondary">{t("diff.result")}</span>
              {computed.ok && hasInput && (
                <span className="tabular-nums text-[12px] text-text-tertiary">
                  {identical
                    ? t("diff.identical")
                    : t("diff.stats", {
                        added: computed.result.added,
                        removed: computed.result.removed,
                      })}
                </span>
              )}
            </div>

            <div
              className="max-h-[320px] min-h-[120px] overflow-auto rounded-[22px] border border-border bg-bg-primary"
              role="region"
              aria-label={t("diff.result")}
            >
              {showEmptyHint && (
                <p className="px-3 py-3 text-[13px] text-text-tertiary">{t("diff.empty")}</p>
              )}

              {!computed.ok && (
                <p role="alert" className="px-3 py-3 text-[13px] text-fail">
                  {t("diff.error.tooLarge", { max: MAX_DIFF_LINES })}
                </p>
              )}

              {computed.ok && identical && (
                <p className="px-3 py-3 text-[13px] text-ok">{t("diff.identical")}</p>
              )}

              {computed.ok && hasInput && !identical && (
                <pre className="m-0 p-0 font-mono text-[12px] leading-relaxed">
                  {computed.result.lines.map((line, idx) => (
                    <div
                      key={`${line.type}-${line.leftNo ?? "x"}-${line.rightNo ?? "x"}-${idx}`}
                      className={`flex gap-2 whitespace-pre-wrap break-all px-3 py-0.5 ${lineTone(line.type)}`}
                    >
                      <span className="w-10 shrink-0 select-none text-right tabular-nums text-text-tertiary">
                        {line.leftNo ?? ""}
                      </span>
                      <span className="w-10 shrink-0 select-none text-right tabular-nums text-text-tertiary">
                        {line.rightNo ?? ""}
                      </span>
                      <span className="w-3 shrink-0 select-none">{linePrefix(line.type)}</span>
                      <span className="min-w-0 flex-1">{line.text.length ? line.text : " "}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setLeft("");
                setRight("");
              }}
              disabled={!hasInput}
            >
              {t("diff.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("diff.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
