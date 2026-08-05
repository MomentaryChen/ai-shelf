import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Fingerprint, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  clampIdCount,
  clampNanoidSize,
  DEFAULT_NANOID_SIZE,
  generateNanoids,
  generateUuids,
  type NanoidAlphabetId,
  NANOID_ALPHABETS,
  parseUuid,
  type UuidVersion,
} from "../utils/uuid-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type ToolId = "uuid" | "nanoid" | "validate";

const TOOLS: { id: ToolId; labelKey: MessageKey }[] = [
  { id: "uuid", labelKey: "uuid.tool.uuid" },
  { id: "nanoid", labelKey: "uuid.tool.nanoid" },
  { id: "validate", labelKey: "uuid.tool.validate" },
];

const ALPHABETS: { id: NanoidAlphabetId; labelKey: MessageKey }[] = [
  { id: "url", labelKey: "uuid.alphabet.url" },
  { id: "alphanumeric", labelKey: "uuid.alphabet.alphanumeric" },
  { id: "numbers", labelKey: "uuid.alphabet.numbers" },
  { id: "lowercase", labelKey: "uuid.alphabet.lowercase" },
  { id: "uppercase", labelKey: "uuid.alphabet.uppercase" },
];

const fieldClass =
  "min-h-[160px] max-h-[280px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary";

const monoInputClass =
  "h-9 border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

function CopyButton({ value }: { value: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!value}
      title={copied ? t("uuid.copied") : t("uuid.copy")}
      className="h-8 shrink-0 px-2 text-[12px]"
      onClick={() => {
        void (async () => {
          const ok = await writeClipboardText(value);
          if (!ok) return;
          setCopied(true);
          if (timerRef.current != null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            setCopied(false);
            timerRef.current = null;
          }, 1600);
        })();
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="hidden @sm:inline">{copied ? t("uuid.copied") : t("uuid.copy")}</span>
    </Button>
  );
}

export function UuidToolsTab() {
  const { t } = useLocale();
  const outputId = useId();
  const countId = useId();
  const sizeId = useId();
  const validateId = useId();

  const [tool, setTool] = useState<ToolId>("uuid");
  const [version, setVersion] = useState<UuidVersion>(4);
  const [uppercase, setUppercase] = useState(false);
  const [count, setCount] = useState(1);
  const [nanoidSize, setNanoidSize] = useState(DEFAULT_NANOID_SIZE);
  const [alphabetId, setAlphabetId] = useState<NanoidAlphabetId>("url");
  const [lines, setLines] = useState<string[]>(() => generateUuids(4, 1));
  const [validateInput, setValidateInput] = useState("");

  // Uppercase is a display transform — never regenerate just because case toggled.
  const output =
    tool === "uuid" && uppercase
      ? lines.map((line) => line.toUpperCase()).join("\n")
      : lines.join("\n");

  const regenerate = () => {
    if (tool === "uuid") {
      setLines(generateUuids(version, count));
      return;
    }
    if (tool === "nanoid") {
      setLines(generateNanoids(count, nanoidSize, NANOID_ALPHABETS[alphabetId]));
    }
  };

  useEffect(() => {
    if (tool === "validate") return;
    if (tool === "uuid") {
      setLines(generateUuids(version, count));
      return;
    }
    setLines(generateNanoids(count, nanoidSize, NANOID_ALPHABETS[alphabetId]));
  }, [tool, version, count, nanoidSize, alphabetId]);

  const parsed = tool === "validate" ? parseUuid(validateInput) : null;

  return (
    <>
      <SectionHeading icon={Fingerprint}>{t("tools.tab.uuid")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("uuid.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={(v) => {
              if (v) setTool(v as ToolId);
            }}
            className="gap-1.5"
            aria-label={t("uuid.tools")}
          >
            {TOOLS.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id} size="sm">
                {t(item.labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {tool !== "validate" && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {tool === "uuid" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12px] font-medium text-text-secondary">
                        {t("uuid.version")}
                      </Label>
                      <ToggleGroup
                        type="single"
                        value={String(version)}
                        onValueChange={(v) => {
                          if (v === "4" || v === "7") setVersion(Number(v) as UuidVersion);
                        }}
                        className="gap-1.5"
                      >
                        <ToggleGroupItem value="4" size="sm" className="min-w-12 px-2.5">
                          v4
                        </ToggleGroupItem>
                        <ToggleGroupItem value="7" size="sm" className="min-w-12 px-2.5">
                          v7
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <Label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] font-normal text-text-primary">
                      <Checkbox
                        checked={uppercase}
                        onCheckedChange={(v) => setUppercase(v === true)}
                      />
                      {t("uuid.uppercase")}
                    </Label>
                  </>
                )}

                {tool === "nanoid" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={sizeId} className="text-[12px] font-medium text-text-secondary">
                        {t("uuid.size")}
                      </Label>
                      <Input
                        id={sizeId}
                        type="number"
                        min={1}
                        max={64}
                        value={nanoidSize}
                        onChange={(e) => setNanoidSize(clampNanoidSize(Number(e.target.value)))}
                        className={`${monoInputClass} w-20`}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Label className="text-[12px] font-medium text-text-secondary">
                        {t("uuid.alphabet")}
                      </Label>
                      <ToggleGroup
                        type="single"
                        value={alphabetId}
                        onValueChange={(v) => {
                          if (v) setAlphabetId(v as NanoidAlphabetId);
                        }}
                        className="flex-wrap gap-1.5"
                      >
                        {ALPHABETS.map((item) => (
                          <ToggleGroupItem key={item.id} value={item.id} size="sm">
                            {t(item.labelKey)}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={countId} className="text-[12px] font-medium text-text-secondary">
                    {t("uuid.count")}
                  </Label>
                  <Input
                    id={countId}
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(clampIdCount(Number(e.target.value)))}
                    className={`${monoInputClass} w-20`}
                  />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9"
                  onClick={regenerate}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("uuid.generate")}
                </Button>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                  <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                    {t("uuid.output")}
                  </Label>
                  <CopyButton value={output} />
                </div>
                <Textarea
                  id={outputId}
                  value={output}
                  readOnly
                  spellCheck={false}
                  placeholder={t("uuid.outputPlaceholder")}
                  className={fieldClass}
                />
              </div>

              <p className="text-[12px] text-text-tertiary">
                {tool === "uuid" ? t("uuid.hint.uuid") : t("uuid.hint.nanoid")}
              </p>
            </>
          )}

          {tool === "validate" && (
            <>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={validateId} className="text-[12px] font-medium text-text-secondary">
                  {t("uuid.input")}
                </Label>
                <Input
                  id={validateId}
                  value={validateInput}
                  onChange={(e) => setValidateInput(e.target.value)}
                  spellCheck={false}
                  placeholder={t("uuid.inputPlaceholder")}
                  className={monoInputClass}
                />
              </div>

              {!validateInput.trim() && (
                <p className="text-[12px] text-text-tertiary">{t("uuid.validate.empty")}</p>
              )}

              {parsed && !parsed.ok && validateInput.trim() && (
                <p role="alert" className="text-[12px] text-fail">
                  {t("uuid.validate.invalid")}
                </p>
              )}

              {parsed?.ok && (
                <div className="grid gap-2 @sm:grid-cols-2">
                  <div className="rounded-md border border-border bg-bg-primary px-3 py-2">
                    <p className="text-[11px] text-text-tertiary">{t("uuid.validate.canonical")}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="min-w-0 break-all font-mono text-[13px] text-text-primary">
                        {parsed.canonical}
                      </p>
                      <CopyButton value={parsed.canonical} />
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-bg-primary px-3 py-2">
                    <p className="text-[11px] text-text-tertiary">{t("uuid.validate.version")}</p>
                    <p className="mt-1 font-mono text-[13px] text-text-primary">
                      {parsed.version != null
                        ? t("uuid.validate.versionValue", { version: parsed.version })
                        : t("uuid.validate.versionUnknown")}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-bg-primary px-3 py-2 @sm:col-span-2">
                    <p className="text-[11px] text-text-tertiary">{t("uuid.validate.variant")}</p>
                    <p className="mt-1 font-mono text-[13px] text-text-primary">
                      {t(`uuid.variant.${parsed.variant}` as MessageKey)}
                    </p>
                  </div>
                </div>
              )}

              <p className="text-[12px] text-text-tertiary">{t("uuid.hint.validate")}</p>
            </>
          )}
        </div>
      </Card>
    </>
  );
}
