import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  defaultEncodeHeader,
  defaultEncodePayload,
  formatClaimTime,
  parseJwt,
  signJwt,
  tryParseJsonObject,
  type DecodedJwt,
  type JwtAlg,
  type JwtVerifyResult,
  verifyJwt,
} from "../utils/jwt-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type ToolId = "decode" | "verify" | "encode";

const TOOLS: { id: ToolId; labelKey: MessageKey }[] = [
  { id: "decode", labelKey: "jwt.tool.decode" },
  { id: "verify", labelKey: "jwt.tool.verify" },
  { id: "encode", labelKey: "jwt.tool.encode" },
];

const HS_ALGS: JwtAlg[] = ["HS256", "HS384", "HS512"];
const RS_ALGS: JwtAlg[] = ["RS256", "RS384", "RS512"];
const ES_ALGS: JwtAlg[] = ["ES256", "ES384", "ES512"];

const fieldClass =
  "h-[180px] resize-none overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

const monoInputClass =
  "h-9 border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
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
      title={copied ? copiedLabel : label}
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
      <span className="hidden @sm:inline">{copied ? copiedLabel : label}</span>
    </Button>
  );
}

function ClaimRows({
  payload,
  nowMs,
}: {
  payload: Record<string, unknown>;
  nowMs: number;
}) {
  const { t } = useLocale();
  const claims = ["iat", "nbf", "exp"] as const;
  const rows = claims
    .map((key) => {
      const info = formatClaimTime(payload[key], nowMs);
      if (!info) return null;
      return { key, info };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[12px] font-medium text-text-secondary">{t("jwt.claims")}</Label>
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {rows.map(({ key, info }) => (
          <div
            key={key}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
          >
            <div className="min-w-0">
              <div className="font-medium text-text-primary">{key}</div>
              <div className="font-mono text-text-secondary">{info.isoUtc}</div>
            </div>
            <div className="text-right text-text-tertiary">
              <div>{info.relative}</div>
              {key === "exp" && info.expired ? (
                <div className="text-fail">{t("jwt.claim.expired")}</div>
              ) : null}
              {key === "nbf" && info.notYetValid ? (
                <div className="text-fail">{t("jwt.claim.notYetValid")}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JwtToolsTab() {
  const { t } = useLocale();
  const [tool, setTool] = useState<ToolId>("decode");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Decode
  const [decodeInput, setDecodeInput] = useState("");
  const [decoded, setDecoded] = useState<DecodedJwt | null>(null);

  // Verify
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyKey, setVerifyKey] = useState("");
  const [verifyResult, setVerifyResult] = useState<JwtVerifyResult | null>(null);
  const [verifyDecoded, setVerifyDecoded] = useState<DecodedJwt | null>(null);

  // Encode
  const [encodeAlg, setEncodeAlg] = useState<JwtAlg>("HS256");
  const [encodeHeader, setEncodeHeader] = useState(() =>
    JSON.stringify(defaultEncodeHeader("HS256"), null, 2),
  );
  const [encodePayload, setEncodePayload] = useState(() =>
    JSON.stringify(defaultEncodePayload(), null, 2),
  );
  const [encodeKey, setEncodeKey] = useState("");
  const [encodeOutput, setEncodeOutput] = useState("");

  const decodeId = useId();
  const verifyTokenId = useId();
  const verifyKeyId = useId();
  const encodeHeaderId = useId();
  const encodePayloadId = useId();
  const encodeKeyId = useId();
  const encodeOutId = useId();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const trimmed = decodeInput.trim();
    if (!trimmed) {
      setDecoded(null);
      setError(null);
      return;
    }
    try {
      setDecoded(parseJwt(trimmed));
      setError(null);
    } catch (err) {
      setDecoded(null);
      setError(err instanceof Error ? err.message : t("jwt.error.generic"));
    }
  }, [decodeInput, t]);

  useEffect(() => {
    setEncodeHeader((prev) => {
      const header = tryParseJsonObject(prev);
      if (!header || header.alg === encodeAlg) return prev;
      return JSON.stringify({ ...header, alg: encodeAlg }, null, 2);
    });
  }, [encodeAlg]);

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : t("jwt.error.generic"));
  };

  const verifyAlg = (() => {
    try {
      if (verifyInput.trim()) return parseJwt(verifyInput).alg;
    } catch {
      /* ignore until verify runs */
    }
    return verifyDecoded?.alg ?? "";
  })();
  const verifyNeedsPem =
    RS_ALGS.includes(verifyAlg as JwtAlg) || ES_ALGS.includes(verifyAlg as JwtAlg);
  const encodeNeedsPem = RS_ALGS.includes(encodeAlg) || ES_ALGS.includes(encodeAlg);

  const runVerify = async () => {
    setBusy(true);
    setError(null);
    setVerifyResult(null);
    setVerifyDecoded(null);
    try {
      const decodedToken = parseJwt(verifyInput);
      setVerifyDecoded(decodedToken);
      const result = await verifyJwt(verifyInput, verifyKey, { nowMs });
      setVerifyResult(result);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runEncode = async () => {
    setBusy(true);
    setError(null);
    setEncodeOutput("");
    try {
      const header = tryParseJsonObject(encodeHeader);
      const payload = tryParseJsonObject(encodePayload);
      if (!header) throw new Error(t("jwt.error.headerJson"));
      if (!payload) throw new Error(t("jwt.error.payloadJson"));
      const token = await signJwt({ ...header, alg: encodeAlg }, payload, encodeKey);
      setEncodeOutput(token);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeading icon={BadgeCheck}>{t("tools.tab.jwt")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("jwt.subtitle")}
      </p>

      <nav aria-label={t("jwt.tools")} className="mb-4 flex flex-wrap gap-1.5">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tool === item.id ? "page" : undefined}
            className={
              tool === item.id
                ? "rounded-full bg-accent-muted px-3 py-1.5 text-[12px] font-medium text-accent"
                : "rounded-full px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }
            onClick={() => {
              setTool(item.id);
              setError(null);
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="mb-3 text-[13px] text-fail">
          {error}
        </p>
      ) : null}

      {tool === "decode" ? (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                <Label htmlFor={decodeId} className="text-[12px] font-medium text-text-secondary">
                  {t("jwt.token")}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[12px]"
                  onClick={() => {
                    setDecodeInput("");
                    setDecoded(null);
                    setError(null);
                  }}
                >
                  {t("jwt.clear")}
                </Button>
              </div>
              <Textarea
                id={decodeId}
                value={decodeInput}
                onChange={(e) => setDecodeInput(e.target.value)}
                spellCheck={false}
                placeholder={t("jwt.tokenPlaceholder")}
                className={fieldClass}
              />
              <p className="text-[12px] text-text-tertiary">{t("jwt.hint.decode")}</p>
            </div>

            {decoded ? (
              <div className="grid items-start gap-4 @md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                    <Label className="text-[12px] font-medium text-text-secondary">
                      {t("jwt.header")}
                      <span className="ml-2 font-mono text-text-tertiary">{decoded.alg}</span>
                    </Label>
                    <CopyButton
                      value={decoded.headerJson}
                      label={t("jwt.copy")}
                      copiedLabel={t("jwt.copied")}
                    />
                  </div>
                  <Textarea
                    readOnly
                    value={decoded.headerJson}
                    className={fieldClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                    <Label className="text-[12px] font-medium text-text-secondary">
                      {t("jwt.payload")}
                    </Label>
                    <CopyButton
                      value={decoded.payloadJson}
                      label={t("jwt.copy")}
                      copiedLabel={t("jwt.copied")}
                    />
                  </div>
                  <Textarea
                    readOnly
                    value={decoded.payloadJson}
                    className={fieldClass}
                  />
                </div>
                <div className="@md:col-span-2">
                  <ClaimRows payload={decoded.payload} nowMs={nowMs} />
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {tool === "verify" ? (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={verifyTokenId} className="text-[12px] font-medium text-text-secondary">
                {t("jwt.token")}
              </Label>
              <Textarea
                id={verifyTokenId}
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                spellCheck={false}
                placeholder={t("jwt.tokenPlaceholder")}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={verifyKeyId} className="text-[12px] font-medium text-text-secondary">
                {verifyNeedsPem ? t("jwt.publicKey") : t("jwt.secret")}
              </Label>
              <Textarea
                id={verifyKeyId}
                value={verifyKey}
                onChange={(e) => setVerifyKey(e.target.value)}
                spellCheck={false}
                placeholder={
                  verifyNeedsPem ? t("jwt.pemPlaceholder") : t("jwt.secretPlaceholder")
                }
                className={fieldClass}
              />
              <p className="text-[12px] text-text-tertiary">{t("jwt.hint.verify")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !verifyInput.trim()} onClick={() => void runVerify()}>
                <ShieldCheck className="h-4 w-4" />
                {t("jwt.action.verify")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setVerifyInput("");
                  setVerifyKey("");
                  setVerifyResult(null);
                  setVerifyDecoded(null);
                  setError(null);
                }}
              >
                {t("jwt.clear")}
              </Button>
            </div>

            {verifyResult ? (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-bg-primary px-3 py-3">
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span
                    className={
                      verifyResult.signatureValid ? "font-medium text-success" : "font-medium text-fail"
                    }
                  >
                    {verifyResult.signatureValid ? t("jwt.verify.ok") : t("jwt.verify.fail")}
                  </span>
                  <span className="font-mono text-text-tertiary">{verifyResult.alg}</span>
                  {verifyResult.expired ? (
                    <span className="text-fail">{t("jwt.claim.expired")}</span>
                  ) : null}
                  {verifyResult.notYetValid ? (
                    <span className="text-fail">{t("jwt.claim.notYetValid")}</span>
                  ) : null}
                </div>
                {verifyDecoded ? <ClaimRows payload={verifyDecoded.payload} nowMs={nowMs} /> : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {tool === "encode" ? (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[12px] font-medium text-text-secondary">{t("jwt.alg")}</Label>
              <ToggleGroup
                type="single"
                value={encodeAlg}
                onValueChange={(v) => {
                  if (!v) return;
                  setEncodeAlg(v as JwtAlg);
                }}
                className="flex flex-wrap justify-start gap-1"
              >
                {[...HS_ALGS, ...RS_ALGS, ...ES_ALGS].map((alg) => (
                  <ToggleGroupItem key={alg} value={alg} className="h-8 px-2.5 text-[12px]">
                    {alg}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="grid items-start gap-4 @md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex h-8 min-w-0 items-center">
                  <Label htmlFor={encodeHeaderId} className="text-[12px] font-medium text-text-secondary">
                    {t("jwt.header")}
                  </Label>
                </div>
                <Textarea
                  id={encodeHeaderId}
                  value={encodeHeader}
                  onChange={(e) => setEncodeHeader(e.target.value)}
                  spellCheck={false}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex h-8 min-w-0 items-center">
                  <Label htmlFor={encodePayloadId} className="text-[12px] font-medium text-text-secondary">
                    {t("jwt.payload")}
                  </Label>
                </div>
                <Textarea
                  id={encodePayloadId}
                  value={encodePayload}
                  onChange={(e) => setEncodePayload(e.target.value)}
                  spellCheck={false}
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={encodeKeyId} className="text-[12px] font-medium text-text-secondary">
                {encodeNeedsPem ? t("jwt.privateKey") : t("jwt.secret")}
              </Label>
              {!encodeNeedsPem ? (
                <Input
                  id={encodeKeyId}
                  value={encodeKey}
                  onChange={(e) => setEncodeKey(e.target.value)}
                  spellCheck={false}
                  placeholder={t("jwt.secretPlaceholder")}
                  className={monoInputClass}
                />
              ) : (
                <Textarea
                  id={encodeKeyId}
                  value={encodeKey}
                  onChange={(e) => setEncodeKey(e.target.value)}
                  spellCheck={false}
                  placeholder={t("jwt.pemPlaceholder")}
                  className={fieldClass}
                />
              )}
              <p className="text-[12px] text-text-tertiary">{t("jwt.hint.encode")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void runEncode()}>
                <KeyRound className="h-4 w-4" />
                {t("jwt.action.encode")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEncodeAlg("HS256");
                  setEncodeHeader(JSON.stringify(defaultEncodeHeader("HS256"), null, 2));
                  setEncodePayload(JSON.stringify(defaultEncodePayload(), null, 2));
                  setEncodeKey("");
                  setEncodeOutput("");
                  setError(null);
                }}
              >
                {t("jwt.clear")}
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                <Label htmlFor={encodeOutId} className="text-[12px] font-medium text-text-secondary">
                  {t("jwt.output")}
                </Label>
                <CopyButton
                  value={encodeOutput}
                  label={t("jwt.copy")}
                  copiedLabel={t("jwt.copied")}
                />
              </div>
              <Textarea
                id={encodeOutId}
                readOnly
                value={encodeOutput}
                placeholder={t("jwt.outputPlaceholder")}
                className={fieldClass}
              />
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}
