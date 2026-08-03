import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Hash, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  decodeBase64,
  decodeHex,
  decodeUrl,
  encodeBase64,
  encodeHex,
  encodeUrl,
  md5Hex,
  shaHex,
  type ShaAlgo,
} from "../utils/codec";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type ToolId = "hash" | "base64" | "url" | "hex";
type Direction = "encode" | "decode";
type HashAlgo = "md5" | "sha1" | "sha256" | "sha512";

const TOOLS: { id: ToolId; labelKey: MessageKey }[] = [
  { id: "hash", labelKey: "codec.tool.hash" },
  { id: "base64", labelKey: "codec.tool.base64" },
  { id: "url", labelKey: "codec.tool.url" },
  { id: "hex", labelKey: "codec.tool.hex" },
];

const HASH_ALGOS: { id: HashAlgo; label: string }[] = [
  { id: "md5", label: "MD5" },
  { id: "sha1", label: "SHA-1" },
  { id: "sha256", label: "SHA-256" },
  { id: "sha512", label: "SHA-512" },
];

const HASH_TO_SHA: Record<Exclude<HashAlgo, "md5">, ShaAlgo> = {
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha512: "SHA-512",
};

const fieldClass =
  "min-h-[140px] max-h-[220px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary";

export function CodecToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const outputId = useId();
  const copiedTimerRef = useRef<number | null>(null);

  const [tool, setTool] = useState<ToolId>("hash");
  const [direction, setDirection] = useState<Direction>("encode");
  const [hashAlgo, setHashAlgo] = useState<HashAlgo>("md5");
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!input) {
        if (!cancelled) {
          setOutput("");
          setError(null);
        }
        return;
      }

      try {
        let next = "";
        if (tool === "hash") {
          if (hashAlgo === "md5") next = md5Hex(input);
          else next = await shaHex(HASH_TO_SHA[hashAlgo], input);
        } else if (tool === "base64") {
          next =
            direction === "encode"
              ? encodeBase64(input, urlSafe)
              : decodeBase64(input, urlSafe);
        } else if (tool === "url") {
          next = direction === "encode" ? encodeUrl(input) : decodeUrl(input);
        } else {
          next = direction === "encode" ? encodeHex(input) : decodeHex(input);
        }
        if (!cancelled) {
          setOutput(next);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setOutput("");
          setError(t("codec.error.invalid"));
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [tool, direction, hashAlgo, urlSafe, input, t]);

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
    if (tool === "hash" || !output) return;
    setInput(output);
    setDirection((d) => (d === "encode" ? "decode" : "encode"));
  };

  const showDirection = tool !== "hash";

  return (
    <>
      <SectionHeading icon={Hash}>{t("tools.tab.codec")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("codec.subtitle")}
      </p>

      <nav aria-label={t("codec.tools")} className="mb-4 flex flex-wrap gap-1.5">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tool === item.id ? "true" : undefined}
            onClick={() => {
              setTool(item.id);
              setError(null);
            }}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-200 ${
              tool === item.id
                ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                : "bg-secondary text-text-primary hover:bg-accent-surface"
            }`}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      <Card>
        <div className="flex flex-col gap-4">
          {tool === "hash" ? (
            <div>
              <Label className="mb-2 block text-[12px] font-medium text-text-secondary">
                {t("codec.hash.algo")}
              </Label>
              <ToggleGroup
                type="single"
                value={hashAlgo}
                onValueChange={(v) => {
                  if (v) setHashAlgo(v as HashAlgo);
                }}
                className="gap-1.5"
              >
                {HASH_ALGOS.map((algo) => (
                  <ToggleGroupItem key={algo.id} value={algo.id} size="sm">
                    {algo.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup
                type="single"
                value={direction}
                onValueChange={(v) => {
                  if (v) setDirection(v as Direction);
                }}
                className="gap-1.5"
              >
                <ToggleGroupItem value="encode" size="sm">
                  {t("codec.direction.encode")}
                </ToggleGroupItem>
                <ToggleGroupItem value="decode" size="sm">
                  {t("codec.direction.decode")}
                </ToggleGroupItem>
              </ToggleGroup>

              {tool === "base64" && (
                <Label className="flex cursor-pointer items-center gap-2 text-[13px] font-normal text-text-primary">
                  <Checkbox
                    checked={urlSafe}
                    onCheckedChange={(v) => setUrlSafe(v === true)}
                  />
                  {t("codec.base64.urlSafe")}
                </Label>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                {t("codec.input")}
              </Label>
              <Textarea
                id={inputId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                placeholder={t("codec.inputPlaceholder")}
                className={fieldClass}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                  {t("codec.output")}
                </Label>
                <div className="flex items-center gap-1">
                  {showDirection && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={swap}
                      disabled={!output}
                      className="h-8 px-2 text-[12px]"
                      title={t("codec.swap")}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      {t("codec.swap")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyOutput()}
                    disabled={!output}
                    className="h-8 px-2 text-[12px]"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? t("codec.copied") : t("codec.copy")}
                  </Button>
                </div>
              </div>
              <Textarea
                id={outputId}
                value={output}
                readOnly
                spellCheck={false}
                placeholder={t("codec.outputPlaceholder")}
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
              {t("codec.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("codec.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
