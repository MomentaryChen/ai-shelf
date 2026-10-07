import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  DEFAULT_MERMAID_SOURCE,
  getMermaidTemplate,
  MERMAID_TEMPLATE_IDS,
  type MermaidTemplateId,
  unwrapMermaidFence,
  wrapMermaidFence,
} from "../utils/mermaid-tools";
import { Card } from "./Card";
import { MermaidBlock } from "./MermaidBlock";
import { SectionHeading } from "./SectionHeading";

const TEMPLATE_LABEL_KEYS: Record<MermaidTemplateId, MessageKey> = {
  flowchart: "mermaid.template.flowchart",
  sequence: "mermaid.template.sequence",
  class: "mermaid.template.class",
  state: "mermaid.template.state",
  er: "mermaid.template.er",
  gantt: "mermaid.template.gantt",
  pie: "mermaid.template.pie",
  mindmap: "mermaid.template.mindmap",
};

const fieldClass =
  "h-[min(60vh,520px)] min-h-[320px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

const previewClass =
  "h-[min(60vh,520px)] min-h-[320px] overflow-auto rounded-[22px] border border-border bg-bg-primary px-4 py-3";

type CopyKind = "source" | "fence" | "svg" | null;

function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MermaidToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const copiedTimerRef = useRef<number | null>(null);

  const [input, setInput] = useState(DEFAULT_MERMAID_SOURCE);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKind>(null);

  const activeTemplate =
    MERMAID_TEMPLATE_IDS.find((id) => getMermaidTemplate(id).source === input) ?? null;

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const markCopied = (kind: Exclude<CopyKind, null>) => {
    setCopied(kind);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(null);
      copiedTimerRef.current = null;
    }, 1600);
  };

  const applyTemplate = (id: MermaidTemplateId) => {
    setInput(getMermaidTemplate(id).source);
  };

  const copyText = async (value: string, kind: Exclude<CopyKind, null>) => {
    if (!value) return;
    const ok = await writeClipboardText(value);
    if (!ok) return;
    markCopied(kind);
  };

  const onPasteNormalize = () => {
    setInput((prev) => unwrapMermaidFence(prev));
  };

  const hasInput = input.trim().length > 0;

  return (
    <>
      <SectionHeading icon={Workflow}>{t("tools.tab.mermaid")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("mermaid.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-[12px] font-medium text-text-secondary">
              {t("mermaid.templates")}
            </Label>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={t("mermaid.templates")}
            >
              {MERMAID_TEMPLATE_IDS.map((id) => {
                const active = activeTemplate === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyTemplate(id)}
                    aria-pressed={active}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-[12px] transition-colors duration-200 ${
                      active
                        ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                        : "bg-secondary text-text-primary hover:bg-accent-surface"
                    }`}
                  >
                    {t(TEMPLATE_LABEL_KEYS[id])}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid items-start gap-3 @md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                  {t("mermaid.input")}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onPasteNormalize}
                  disabled={!hasInput}
                  className="h-8 px-2 text-[12px]"
                  title={t("mermaid.unwrap")}
                >
                  {t("mermaid.unwrap")}
                </Button>
              </div>
              <Textarea
                id={inputId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                placeholder={t("mermaid.inputPlaceholder")}
                className={fieldClass}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("mermaid.preview")}
                </Label>
              </div>
              <div className={previewClass}>
                {hasInput ? (
                  <MermaidBlock
                    chart={input}
                    className="mb-0 border-0 bg-transparent p-0"
                    onSvgChange={setSvg}
                  />
                ) : (
                  <p className="text-[13px] text-text-tertiary">{t("mermaid.empty")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyText(input, "source")}
              disabled={!hasInput}
            >
              {copied === "source" ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === "source" ? t("mermaid.copied") : t("mermaid.copy")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyText(wrapMermaidFence(input), "fence")}
              disabled={!hasInput}
            >
              {copied === "fence" ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === "fence" ? t("mermaid.copied") : t("mermaid.copyFence")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!svg) return;
                void copyText(svg, "svg");
              }}
              disabled={!svg}
            >
              {copied === "svg" ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === "svg" ? t("mermaid.copied") : t("mermaid.copySvg")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!svg) return;
                downloadSvg(svg, "diagram.svg");
              }}
              disabled={!svg}
            >
              <Download className="h-3.5 w-3.5" />
              {t("mermaid.downloadSvg")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setInput("");
                setSvg(null);
              }}
              disabled={!hasInput}
            >
              {t("mermaid.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("mermaid.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
