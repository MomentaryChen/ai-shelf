import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  buildWslSnippets,
  convertWslPaths,
  type WslConvertDirection,
  type WslDistro,
  type WslWindowsStyle,
} from "../../shared/wsl-paths.js";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type PanelId = "paths" | "distros" | "snippets";

const PANELS: { id: PanelId; labelKey: MessageKey }[] = [
  { id: "paths", labelKey: "wsl.panel.paths" },
  { id: "distros", labelKey: "wsl.panel.distros" },
  { id: "snippets", labelKey: "wsl.panel.snippets" },
];

const fieldClass =
  "min-h-[140px] max-h-[240px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary";

const monoInputClass =
  "h-9 border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

const headClass =
  "normal-case tracking-normal text-[12px] font-medium text-text-secondary";

function CopyButton({ value, labelKey = "wsl.copy" }: { value: string; labelKey?: MessageKey }) {
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
      title={copied ? t("wsl.copied") : t(labelKey)}
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
      <span className="hidden @sm:inline">{copied ? t("wsl.copied") : t(labelKey)}</span>
    </Button>
  );
}

function reasonMessage(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  reason: string,
): string {
  if (reason === "needs-distro") return t("wsl.error.needsDistro");
  if (reason === "unknown") return t("wsl.error.unknownPath");
  if (reason === "unsupported") return t("wsl.error.unsupported");
  return t("wsl.error.unknownPath");
}

export function WslToolsTab({ active = true }: { active?: boolean }) {
  const { t } = useLocale();
  const inputId = useId();
  const outputId = useId();
  const distroId = useId();
  const snippetPathId = useId();

  const [panel, setPanel] = useState<PanelId>("paths");
  const [input, setInput] = useState("C:\\Users\\me\\project");
  const [direction, setDirection] = useState<WslConvertDirection>("auto");
  const [windowsStyle, setWindowsStyle] = useState<WslWindowsStyle>("drive");
  const [distro, setDistro] = useState("Ubuntu");
  const [snippetPath, setSnippetPath] = useState("C:\\Users\\me\\project");

  const [distros, setDistros] = useState<WslDistro[]>([]);
  const [distrosLoading, setDistrosLoading] = useState(false);
  const [distrosError, setDistrosError] = useState<string | null>(null);
  const [platformSupported, setPlatformSupported] = useState(true);
  const [selectedDistro, setSelectedDistro] = useState<string | null>(null);
  const [ip, setIp] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);

  const converted = useMemo(() => {
    return convertWslPaths(input, { direction, distro, windowsStyle });
  }, [input, direction, distro, windowsStyle]);

  const output = converted.lines.join("\n");
  const convertHint =
    converted.errors.length > 0
      ? reasonMessage(t, converted.errors[0]!.reason) +
        (converted.errors.length > 1
          ? ` (${String(converted.errors.length)} ${t("wsl.error.lineCount")})`
          : "")
      : null;

  const snippets = useMemo(
    () => buildWslSnippets({ path: snippetPath, distro }),
    [snippetPath, distro],
  );

  const refreshDistros = useCallback(async () => {
    if (!window.api?.wslListDistros) {
      setDistrosError(t("wsl.error.unavailable"));
      setDistros([]);
      setPlatformSupported(false);
      return;
    }
    setDistrosLoading(true);
    setDistrosError(null);
    try {
      const result = await window.api.wslListDistros();
      setPlatformSupported(result.platformSupported !== false);
      if (!result.ok) {
        setDistros([]);
        if (result.code === "unsupported") setDistrosError(t("wsl.error.unsupportedPlatform"));
        else if (result.code === "missing") setDistrosError(t("wsl.error.missing"));
        else setDistrosError(result.error || t("wsl.error.listFailed"));
        return;
      }
      setDistros(result.distros);
      const preferred =
        result.distros.find((d) => d.isDefault)?.name ?? result.distros[0]?.name ?? null;
      setSelectedDistro((prev) => {
        if (prev && result.distros.some((d) => d.name === prev)) return prev;
        return preferred;
      });
      if (preferred) {
        setDistro((prev) => (prev.trim() && prev !== "Ubuntu" ? prev : preferred));
      }
    } catch {
      setDistros([]);
      setDistrosError(t("wsl.error.listFailed"));
    } finally {
      setDistrosLoading(false);
    }
  }, [t]);

  const fetchIp = useCallback(
    async (name: string) => {
      if (!window.api?.wslDistroIp) {
        setIpError(t("wsl.error.unavailable"));
        return;
      }
      setIpLoading(true);
      setIpError(null);
      try {
        const result = await window.api.wslDistroIp(name);
        if (!result.ok) {
          setIp(null);
          if (result.code === "unsupported") setIpError(t("wsl.error.unsupportedPlatform"));
          else if (result.code === "missing") setIpError(t("wsl.error.missing"));
          else setIpError(result.error || t("wsl.error.ipFailed"));
          return;
        }
        setIp(result.ip);
      } catch {
        setIp(null);
        setIpError(t("wsl.error.ipFailed"));
      } finally {
        setIpLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!active) return;
    if (panel !== "distros") return;
    void refreshDistros();
  }, [active, panel, refreshDistros]);

  const swapPaths = () => {
    setInput(output);
  };

  const useConvertedInSnippets = () => {
    const first = converted.lines.find((line) => line.trim()) ?? input;
    setSnippetPath(first);
    setPanel("snippets");
  };

  const applyDistro = (name: string) => {
    setDistro(name);
    setSelectedDistro(name);
  };

  return (
    <>
      <SectionHeading icon={Terminal}>{t("tools.tab.wsl")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("wsl.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            value={panel}
            onValueChange={(v) => {
              if (v) setPanel(v as PanelId);
            }}
            className="gap-1.5"
            aria-label={t("wsl.panels")}
          >
            {PANELS.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id} size="sm">
                {t(item.labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {panel === "paths" && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("wsl.direction")}
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={direction}
                    onValueChange={(v) => {
                      if (v === "auto" || v === "to-wsl" || v === "to-windows") {
                        setDirection(v);
                      }
                    }}
                    className="gap-1.5"
                  >
                    <ToggleGroupItem value="auto" size="sm">
                      {t("wsl.direction.auto")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="to-wsl" size="sm">
                      {t("wsl.direction.toWsl")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="to-windows" size="sm">
                      {t("wsl.direction.toWindows")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("wsl.windowsStyle")}
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={windowsStyle}
                    onValueChange={(v) => {
                      if (v === "drive" || v === "unc") setWindowsStyle(v);
                    }}
                    className="gap-1.5"
                  >
                    <ToggleGroupItem value="drive" size="sm">
                      {t("wsl.windowsStyle.drive")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="unc" size="sm">
                      {t("wsl.windowsStyle.unc")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
                  <Label htmlFor={distroId} className="text-[12px] font-medium text-text-secondary">
                    {t("wsl.distro")}
                  </Label>
                  <Input
                    id={distroId}
                    value={distro}
                    onChange={(e) => setDistro(e.target.value)}
                    placeholder={t("wsl.distroPlaceholder")}
                    className={monoInputClass}
                  />
                </div>
              </div>

              <div className="@container grid gap-3 @lg:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                      {t("wsl.input")}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[12px]"
                      onClick={() => setInput("")}
                    >
                      {t("wsl.clear")}
                    </Button>
                  </div>
                  <Textarea
                    id={inputId}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("wsl.inputPlaceholder")}
                    className={fieldClass}
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={outputId} className="text-[12px] font-medium text-text-secondary">
                      {t("wsl.output")}
                    </Label>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-[12px]"
                        title={t("wsl.swap")}
                        disabled={!output.trim()}
                        onClick={swapPaths}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        <span className="hidden @sm:inline">{t("wsl.swap")}</span>
                      </Button>
                      <CopyButton value={output.trim()} />
                    </div>
                  </div>
                  <Textarea
                    id={outputId}
                    value={output}
                    readOnly
                    placeholder={t("wsl.outputPlaceholder")}
                    className={fieldClass}
                    spellCheck={false}
                  />
                </div>
              </div>

              {convertHint && (
                <p className="text-[13px] leading-relaxed text-text-primary" role="status">
                  {convertHint}
                </p>
              )}
              <p className="text-[12px] leading-relaxed text-text-secondary">{t("wsl.hint.paths")}</p>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 px-3"
                  disabled={!output.trim()}
                  onClick={useConvertedInSnippets}
                >
                  {t("wsl.useInSnippets")}
                </Button>
              </div>
            </>
          )}

          {panel === "distros" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 px-3"
                  disabled={distrosLoading}
                  onClick={() => void refreshDistros()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${distrosLoading ? "animate-spin" : ""}`} />
                  {distrosLoading ? t("wsl.refreshing") : t("wsl.refresh")}
                </Button>
                {selectedDistro && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9 px-3"
                    disabled={ipLoading}
                    onClick={() => void fetchIp(selectedDistro)}
                  >
                    {ipLoading ? t("wsl.ip.working") : t("wsl.ip.fetch")}
                  </Button>
                )}
                {ip && (
                  <div className="flex items-center gap-1 rounded-[22px] bg-sand px-3 py-1.5">
                    <span className="text-[12px] text-text-secondary">{t("wsl.ip.label")}</span>
                    <span className="font-mono text-[13px] tabular-nums text-ink">{ip}</span>
                    <CopyButton value={ip} />
                  </div>
                )}
              </div>

              {distrosError && (
                <p className="text-[13px] leading-relaxed text-text-primary" role="alert">
                  {distrosError}
                </p>
              )}
              {ipError && (
                <p className="text-[13px] leading-relaxed text-text-primary" role="alert">
                  {ipError}
                </p>
              )}

              {!platformSupported && !distrosError && (
                <p className="text-[13px] leading-relaxed text-text-secondary">
                  {t("wsl.error.unsupportedPlatform")}
                </p>
              )}

              {distros.length === 0 && !distrosLoading && !distrosError ? (
                <p className="text-[13px] leading-relaxed text-text-secondary">{t("wsl.distros.empty")}</p>
              ) : distros.length > 0 ? (
                <div className="overflow-hidden rounded-[22px] bg-sand/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-sand hover:bg-transparent">
                        <TableHead className={headClass}>{t("wsl.col.name")}</TableHead>
                        <TableHead className={headClass}>{t("wsl.col.state")}</TableHead>
                        <TableHead className={headClass}>{t("wsl.col.version")}</TableHead>
                        <TableHead className={headClass}>{t("wsl.col.action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {distros.map((row) => {
                        const selected = selectedDistro === row.name;
                        return (
                          <TableRow
                            key={row.name}
                            className={`border-sand ${selected ? "bg-accent-soft/40" : ""}`}
                            onClick={() => setSelectedDistro(row.name)}
                          >
                            <TableCell className="font-mono text-[13px] text-ink">
                              {row.name}
                              {row.isDefault ? (
                                <span className="ml-2 text-[11px] text-success">
                                  {t("wsl.default")}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-[13px] text-text-primary">{row.state}</TableCell>
                            <TableCell className="tabular-nums text-[13px] text-text-primary">
                              {row.version || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-[12px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    applyDistro(row.name);
                                  }}
                                >
                                  {t("wsl.useDistro")}
                                </Button>
                                <CopyButton value={row.name} labelKey="wsl.copyName" />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              <p className="text-[12px] leading-relaxed text-text-secondary">
                {t("wsl.hint.distros")}
              </p>
            </>
          )}

          {panel === "snippets" && (
            <>
              <div className="grid gap-3 @lg:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={snippetPathId}
                    className="text-[12px] font-medium text-text-secondary"
                  >
                    {t("wsl.snippetPath")}
                  </Label>
                  <Input
                    id={snippetPathId}
                    value={snippetPath}
                    onChange={(e) => setSnippetPath(e.target.value)}
                    placeholder={t("wsl.inputPlaceholder")}
                    className={monoInputClass}
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("wsl.distro")}
                  </Label>
                  <Input
                    value={distro}
                    onChange={(e) => setDistro(e.target.value)}
                    placeholder={t("wsl.distroPlaceholder")}
                    className={monoInputClass}
                    spellCheck={false}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {snippets.length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-text-secondary">
                    {t("wsl.snippets.empty")}
                  </p>
                ) : (
                  snippets.map((snippet) => (
                    <div
                      key={snippet.id}
                      className="flex flex-col gap-1.5 rounded-[22px] bg-sand px-3.5 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-text-secondary">
                          {t(`wsl.snippet.${snippet.id}` as MessageKey)}
                        </span>
                        <CopyButton value={snippet.command} />
                      </div>
                      <code className="break-all font-mono text-[12px] leading-relaxed text-ink">
                        {snippet.command}
                      </code>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {t("wsl.hint.snippets")}
              </p>
            </>
          )}
        </div>
      </Card>
    </>
  );
}
