import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Hash, ArrowLeftRight, ImagePlus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  base64ToObjectUrl,
  type ImageBase64Format,
  imageFileToBase64,
  parseDataUrl,
  rawBase64ToDataUrl,
} from "../utils/image-base64";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type ToolId = "hash" | "base64" | "image" | "url" | "hex";
type Direction = "encode" | "decode";
type HashAlgo = "md5" | "sha1" | "sha256" | "sha512";

const TOOLS: { id: ToolId; labelKey: MessageKey }[] = [
  { id: "hash", labelKey: "codec.tool.hash" },
  { id: "base64", labelKey: "codec.tool.base64" },
  { id: "image", labelKey: "codec.tool.image" },
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
  "h-[180px] resize-none overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

export function CodecToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const outputId = useId();
  const fileInputId = useId();
  const copiedTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewSourceRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipAutoPreviewRef = useRef(false);

  const [tool, setTool] = useState<ToolId>("hash");
  const [direction, setDirection] = useState<Direction>("encode");
  const [hashAlgo, setHashAlgo] = useState<HashAlgo>("md5");
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageFormat, setImageFormat] = useState<ImageBase64Format>("dataUrl");
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [enlargeOpen, setEnlargeOpen] = useState(false);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    previewSourceRef.current = null;
    setPreviewUrl(null);
  };

  const applyPreviewUrl = (url: string, source: string) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    previewSourceRef.current = source;
    setPreviewUrl(url);
  };

  const setPreviewFromFile = (file: File) => {
    const url = URL.createObjectURL(file);
    applyPreviewUrl(url, `file:${file.name}:${file.size}:${file.lastModified}`);
  };

  const trySetPreviewFromBase64 = (source: string, reportError: boolean): boolean => {
    const trimmed = source.trim();
    if (!trimmed) {
      revokePreview();
      if (reportError) setError(t("codec.error.invalid"));
      return false;
    }
    if (previewSourceRef.current === trimmed && previewUrlRef.current) {
      if (reportError) setError(null);
      return true;
    }
    try {
      const url = base64ToObjectUrl(trimmed);
      applyPreviewUrl(url, trimmed);
      setError(null);
      return true;
    } catch {
      revokePreview();
      if (reportError) setError(t("codec.error.invalid"));
      return false;
    }
  };

  const encodeImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError(t("codec.image.error.type"));
      setOutput("");
      return;
    }
    try {
      setFileName(file.name);
      setPreviewFromFile(file);
      skipAutoPreviewRef.current = true;
      const next = await imageFileToBase64(file, imageFormat);
      previewSourceRef.current = next.trim();
      setOutput(next);
      setError(null);
    } catch {
      setOutput("");
      setError(t("codec.image.error.read"));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (tool === "image") return;

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

  // Live preview while pasting / editing Base64 (debounced).
  useEffect(() => {
    if (tool !== "image") return;
    if (skipAutoPreviewRef.current) {
      skipAutoPreviewRef.current = false;
      return;
    }
    const source = output.trim();
    if (!source) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      previewSourceRef.current = null;
      setPreviewUrl(null);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      if (previewSourceRef.current === source && previewUrlRef.current) {
        setError(null);
        return;
      }
      try {
        const url = base64ToObjectUrl(source);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        previewSourceRef.current = source;
        setPreviewUrl(url);
        setError(null);
      } catch {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        previewSourceRef.current = null;
        setPreviewUrl(null);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [tool, output]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
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
    if (tool === "hash" || tool === "image" || !output) return;
    setInput(output);
    setDirection((d) => (d === "encode" ? "decode" : "encode"));
  };

  const showDirection = tool !== "hash" && tool !== "image";

  const previewFromBase64 = () => {
    trySetPreviewFromBase64(output || input, true);
  };

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
              setEnlargeOpen(false);
              if (item.id !== "image") {
                revokePreview();
                setFileName(null);
              }
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
        {tool === "image" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup
                type="single"
                value={imageFormat}
                onValueChange={(v) => {
                  if (!v) return;
                  const next = v as ImageBase64Format;
                  setImageFormat(next);
                  if (output.startsWith("data:") && next === "raw") {
                    const parsed = parseDataUrl(output);
                    if (parsed) setOutput(parsed.base64);
                  } else if (!output.startsWith("data:") && next === "dataUrl" && output) {
                    try {
                      setOutput(rawBase64ToDataUrl(output));
                    } catch {
                      setOutput(`data:image/png;base64,${output.replace(/\s+/gu, "")}`);
                    }
                  }
                }}
                className="gap-1.5"
              >
                <ToggleGroupItem value="dataUrl" size="sm">
                  {t("codec.image.format.dataUrl")}
                </ToggleGroupItem>
                <ToggleGroupItem value="raw" size="sm">
                  {t("codec.image.format.raw")}
                </ToggleGroupItem>
              </ToggleGroup>
              {fileName && (
                <span className="truncate text-[12px] text-text-tertiary">{fileName}</span>
              )}
            </div>

            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void encodeImageFile(file);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void encodeImageFile(file);
              }}
              className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed px-4 py-6 text-center transition-colors duration-200 ${
                dragOver
                  ? "border-accent bg-accent-surface"
                  : "border-border bg-bg-primary hover:bg-accent-surface"
              }`}
            >
              <ImagePlus className="h-6 w-6 text-text-secondary" />
              <span className="text-[13px] text-text-primary">{t("codec.image.drop")}</span>
              <span className="text-[12px] text-text-tertiary">{t("codec.image.hint")}</span>
            </button>

            <div className="grid items-start gap-3 @md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                  <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                    {t("codec.output")}
                  </Label>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={previewFromBase64}
                      disabled={!output}
                      className="h-8 px-2 text-[12px]"
                    >
                      {t("codec.image.preview")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void copyOutput()}
                      disabled={!output}
                      title={copied ? t("codec.copied") : t("codec.copy")}
                      className="h-8 px-2 text-[12px]"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden @sm:inline">
                        {copied ? t("codec.copied") : t("codec.copy")}
                      </span>
                    </Button>
                  </div>
                </div>
                <Textarea
                  id={outputId}
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  spellCheck={false}
                  placeholder={t("codec.image.outputPlaceholder")}
                  aria-invalid={error ? true : undefined}
                  className={fieldClass}
                />
                {error && (
                  <p role="alert" className="text-[12px] text-fail">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("codec.image.previewLabel")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnlargeOpen(true)}
                    disabled={!previewUrl}
                    className="h-8 px-2 text-[12px]"
                    title={t("codec.image.enlarge")}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    {t("codec.image.enlarge")}
                  </Button>
                </div>
                <div className="relative flex h-[180px] items-center justify-center overflow-hidden rounded-[22px] border border-border bg-bg-primary p-3">
                  {previewUrl ? (
                    <button
                      type="button"
                      onClick={() => setEnlargeOpen(true)}
                      className="flex max-h-[200px] max-w-full cursor-zoom-in items-center justify-center rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,123,90,0.45)]"
                      title={t("codec.image.enlarge")}
                      aria-label={t("codec.image.enlarge")}
                    >
                      <img
                        src={previewUrl}
                        alt={fileName ?? t("codec.image.previewLabel")}
                        className="max-h-[200px] max-w-full object-contain"
                        onError={() => {
                          revokePreview();
                          setError(t("codec.image.error.preview"));
                        }}
                      />
                    </button>
                  ) : (
                    <span className="text-[12px] text-text-tertiary">
                      {t("codec.image.previewEmpty")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOutput("");
                  setFileName(null);
                  setError(null);
                  setEnlargeOpen(false);
                  revokePreview();
                }}
                disabled={!output && !previewUrl}
              >
                {t("codec.clear")}
              </Button>
            </div>

            <Dialog open={enlargeOpen && !!previewUrl} onOpenChange={setEnlargeOpen}>
              <DialogContent
                className="flex max-h-[90vh] max-w-[min(92vw,960px)] flex-col gap-3 border-border bg-bg-card p-4 text-text-primary"
                aria-describedby={undefined}
              >
                <DialogHeader className="pr-8">
                  <DialogTitle className="text-[15px] font-semibold text-text-primary">
                    {fileName ?? t("codec.image.enlargeTitle")}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-[22px] bg-bg-primary p-3">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={fileName ?? t("codec.image.previewLabel")}
                      className="max-h-[min(78vh,820px)] max-w-full object-contain"
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
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

            <div className="grid items-start gap-3 @md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex h-8 min-w-0 items-center">
                  <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                    {t("codec.input")}
                  </Label>
                </div>
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
                <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                  <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                    {t("codec.output")}
                  </Label>
                  <div className="flex shrink-0 items-center justify-end gap-1">
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
                        <span className="hidden @sm:inline">{t("codec.swap")}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void copyOutput()}
                      disabled={!output}
                      title={copied ? t("codec.copied") : t("codec.copy")}
                      className="h-8 px-2 text-[12px]"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden @sm:inline">
                        {copied ? t("codec.copied") : t("codec.copy")}
                      </span>
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
        )}
      </Card>
    </>
  );
}
