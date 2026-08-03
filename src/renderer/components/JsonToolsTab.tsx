import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeftRight, Braces, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import {
  transformJson,
  type JsonIndent,
  type JsonMode,
} from "../utils/json-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

const fieldClass =
  "min-h-[180px] max-h-[320px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary";

export function JsonToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const outputId = useId();
  const copiedTimerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<JsonMode>("pretty");
  const [indent, setIndent] = useState<JsonIndent>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!input.trim()) {
      setOutput("");
      setError(null);
      return;
    }

    const result = transformJson(input, {
      mode,
      indent,
      sortKeys,
    });

    if (result.ok) {
      setOutput(result.text);
      setError(null);
      return;
    }

    setOutput("");
    setError(
      result.reason === "empty" ? null : t("json.error.invalid"),
    );
  }, [input, mode, indent, sortKeys, t]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const copyOutput = async () => {
    if (!output) return;
    const ok = await writeClipboardText(output);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  };

  const swap = () => {
    if (!output) return;
    setInput(output);
  };

  return (
    <>
      <SectionHeading icon={Braces}>{t("tools.tab.json")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("json.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => {
                if (v) setMode(v as JsonMode);
              }}
              className="gap-1.5"
            >
              <ToggleGroupItem value="pretty" size="sm">
                {t("json.mode.pretty")}
              </ToggleGroupItem>
              <ToggleGroupItem value="minify" size="sm">
                {t("json.mode.minify")}
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex flex-wrap items-center gap-3">
              {mode === "pretty" && (
                <div className="flex items-center gap-2">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("json.indent")}
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={String(indent)}
                    onValueChange={(v) => {
                      if (v === "2" || v === "4") setIndent(Number(v) as JsonIndent);
                    }}
                    className="gap-1.5"
                  >
                    <ToggleGroupItem value="2" size="sm">
                      2
                    </ToggleGroupItem>
                    <ToggleGroupItem value="4" size="sm">
                      4
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              )}
              <Label className="flex cursor-pointer items-center gap-2 text-[13px] font-normal text-text-primary">
                <Checkbox
                  checked={sortKeys}
                  onCheckedChange={(v) => setSortKeys(v === true)}
                />
                {t("json.sortKeys")}
              </Label>
            </div>
          </div>

          <div className="grid gap-3 @md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                {t("json.input")}
              </Label>
              <Textarea
                id={inputId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                placeholder={t("json.inputPlaceholder")}
                className={fieldClass}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                  {t("json.output")}
                </Label>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={swap}
                    disabled={!output}
                    className="h-8 px-2 text-[12px]"
                    title={t("json.swap")}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span className="hidden @sm:inline">{t("json.swap")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyOutput()}
                    disabled={!output}
                    title={copied ? t("json.copied") : t("json.copy")}
                    className="h-8 px-2 text-[12px]"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden @sm:inline">
                      {copied ? t("json.copied") : t("json.copy")}
                    </span>
                  </Button>
                </div>
              </div>
              <Textarea
                id={outputId}
                value={output}
                readOnly
                spellCheck={false}
                placeholder={t("json.outputPlaceholder")}
                aria-invalid={error ? true : undefined}
                className={fieldClass}
              />
              {error && (
                <p role="alert" className="text-[12px] text-fail">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setInput("");
                setOutput("");
                setError(null);
              }}
              disabled={!input && !output}
            >
              {t("json.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("json.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
