import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeftRight, Check, Copy, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { JsonIndent } from "../utils/json-tools";
import {
  transformYamlJson,
  type YamlJsonDirection,
  type YamlJsonJsonMode,
} from "../utils/yaml-json-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

const fieldClass =
  "h-[260px] resize-none overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

export function YamlJsonToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const outputId = useId();
  const copiedTimerRef = useRef<number | null>(null);

  const [direction, setDirection] = useState<YamlJsonDirection>("yaml-to-json");
  const [jsonMode, setJsonMode] = useState<YamlJsonJsonMode>("pretty");
  const [indent, setIndent] = useState<JsonIndent>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const showJsonMode = direction === "yaml-to-json";
  const showIndent = direction === "json-to-yaml" || jsonMode === "pretty";

  useEffect(() => {
    if (!input.trim()) {
      setOutput("");
      setError(null);
      return;
    }

    const result = transformYamlJson(input, {
      direction,
      indent,
      sortKeys,
      jsonMode,
    });

    if (result.ok) {
      setOutput(result.text);
      setError(null);
      return;
    }

    setOutput("");
    setError(
      result.reason === "empty"
        ? null
        : direction === "yaml-to-json"
          ? t("yaml.error.invalidYaml")
          : t("yaml.error.invalidJson"),
    );
  }, [input, direction, indent, sortKeys, jsonMode, t]);

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
    setDirection((d) => (d === "yaml-to-json" ? "json-to-yaml" : "yaml-to-json"));
  };

  return (
    <>
      <SectionHeading icon={FileCode2}>{t("tools.tab.yaml")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("yaml.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              value={direction}
              onValueChange={(v) => {
                if (v) setDirection(v as YamlJsonDirection);
              }}
              className="gap-1.5"
            >
              <ToggleGroupItem value="yaml-to-json" size="sm">
                {t("yaml.direction.yamlToJson")}
              </ToggleGroupItem>
              <ToggleGroupItem value="json-to-yaml" size="sm">
                {t("yaml.direction.jsonToYaml")}
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex flex-wrap items-center gap-3">
              {showJsonMode && (
                <ToggleGroup
                  type="single"
                  value={jsonMode}
                  onValueChange={(v) => {
                    if (v) setJsonMode(v as YamlJsonJsonMode);
                  }}
                  className="gap-1.5"
                >
                  <ToggleGroupItem value="pretty" size="sm">
                    {t("yaml.mode.pretty")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="minify" size="sm">
                    {t("yaml.mode.minify")}
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              {showIndent && (
                <div className="flex items-center gap-2">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("yaml.indent")}
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={String(indent)}
                    onValueChange={(v) => {
                      if (v === "2" || v === "4") setIndent(Number(v) as JsonIndent);
                    }}
                    className="gap-1.5"
                  >
                    <ToggleGroupItem value="2" size="sm" className="min-w-9 px-2.5">
                      2
                    </ToggleGroupItem>
                    <ToggleGroupItem value="4" size="sm" className="min-w-9 px-2.5">
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
                {t("yaml.sortKeys")}
              </Label>
            </div>
          </div>

          <div className="grid items-start gap-3 @md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center">
                <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                  {direction === "yaml-to-json" ? t("yaml.inputYaml") : t("yaml.inputJson")}
                </Label>
              </div>
              <Textarea
                id={inputId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                placeholder={
                  direction === "yaml-to-json"
                    ? t("yaml.inputYamlPlaceholder")
                    : t("yaml.inputJsonPlaceholder")
                }
                className={fieldClass}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                  {direction === "yaml-to-json" ? t("yaml.outputJson") : t("yaml.outputYaml")}
                </Label>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={swap}
                    disabled={!output}
                    className="h-8 px-2 text-[12px]"
                    title={t("yaml.swap")}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span className="hidden @sm:inline">{t("yaml.swap")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyOutput()}
                    disabled={!output}
                    title={copied ? t("yaml.copied") : t("yaml.copy")}
                    className="h-8 px-2 text-[12px]"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden @sm:inline">
                      {copied ? t("yaml.copied") : t("yaml.copy")}
                    </span>
                  </Button>
                </div>
              </div>
              <Textarea
                id={outputId}
                value={output}
                readOnly
                spellCheck={false}
                placeholder={t("yaml.outputPlaceholder")}
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
              {t("yaml.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("yaml.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
