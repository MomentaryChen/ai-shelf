import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  aesDecrypt,
  aesEncrypt,
  type AesKeyBits,
  type AesMode,
  type EcCurve,
  ecdsaSign,
  ecdsaVerify,
  generateAesIvHex,
  generateAesKeyHex,
  generateEcKeyPair,
  generateRsaKeyPair,
  generateRsaSignKeyPair,
  type RsaModulusBits,
  rsaDecrypt,
  rsaEncrypt,
  rsaSign,
  rsaVerify,
} from "../utils/crypto-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type ToolId = "aes" | "rsa" | "ecdsa";
type AesAction = "encrypt" | "decrypt";
type RsaAction = "encrypt" | "decrypt" | "sign" | "verify";
type EcAction = "sign" | "verify";

const TOOLS: { id: ToolId; labelKey: MessageKey }[] = [
  { id: "aes", labelKey: "crypto.tool.aes" },
  { id: "rsa", labelKey: "crypto.tool.rsa" },
  { id: "ecdsa", labelKey: "crypto.tool.ecdsa" },
];

const fieldClass =
  "min-h-[120px] max-h-[220px] resize-y overflow-auto border-border bg-bg-primary font-mono text-[13px] leading-relaxed text-text-primary placeholder:text-text-tertiary";

const monoInputClass =
  "h-9 border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

export function CryptoToolsTab() {
  const { t } = useLocale();
  const copiedTimerRef = useRef<number | null>(null);
  const [tool, setTool] = useState<ToolId>("aes");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // AES
  const [aesAction, setAesAction] = useState<AesAction>("encrypt");
  const [aesMode, setAesMode] = useState<AesMode>("AES-GCM");
  const [aesBits, setAesBits] = useState<AesKeyBits>(256);
  const [aesKey, setAesKey] = useState("");
  const [aesIv, setAesIv] = useState("");
  const [aesInput, setAesInput] = useState("");
  const [aesOutput, setAesOutput] = useState("");

  // RSA
  const [rsaAction, setRsaAction] = useState<RsaAction>("encrypt");
  const [rsaBits, setRsaBits] = useState<RsaModulusBits>(2048);
  const [rsaPublic, setRsaPublic] = useState("");
  const [rsaPrivate, setRsaPrivate] = useState("");
  const [rsaInput, setRsaInput] = useState("");
  const [rsaSignature, setRsaSignature] = useState("");
  const [rsaOutput, setRsaOutput] = useState("");
  const [rsaVerified, setRsaVerified] = useState<boolean | null>(null);

  // ECDSA
  const [ecAction, setEcAction] = useState<EcAction>("sign");
  const [ecCurve, setEcCurve] = useState<EcCurve>("P-256");
  const [ecPublic, setEcPublic] = useState("");
  const [ecPrivate, setEcPrivate] = useState("");
  const [ecInput, setEcInput] = useState("");
  const [ecSignature, setEcSignature] = useState("");
  const [ecOutput, setEcOutput] = useState("");
  const [ecVerified, setEcVerified] = useState<boolean | null>(null);

  const aesInId = useId();
  const aesOutId = useId();
  const rsaInId = useId();
  const rsaOutId = useId();
  const ecInId = useId();
  const ecOutId = useId();

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const markCopied = async (text: string) => {
    if (!text) return;
    const ok = await writeClipboardText(text);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  };

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : t("crypto.error.generic"));
  };

  const runAes = async () => {
    setBusy(true);
    setError(null);
    try {
      if (aesAction === "encrypt") {
        setAesOutput(await aesEncrypt(aesInput, aesKey, aesIv, aesMode, aesBits));
      } else {
        setAesOutput(await aesDecrypt(aesInput, aesKey, aesIv, aesMode, aesBits));
      }
    } catch (err) {
      setAesOutput("");
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runRsa = async () => {
    setBusy(true);
    setError(null);
    setRsaVerified(null);
    try {
      if (rsaAction === "encrypt") {
        setRsaOutput(await rsaEncrypt(rsaInput, rsaPublic));
      } else if (rsaAction === "decrypt") {
        setRsaOutput(await rsaDecrypt(rsaInput, rsaPrivate));
      } else if (rsaAction === "sign") {
        const sig = await rsaSign(rsaInput, rsaPrivate);
        setRsaSignature(sig);
        setRsaOutput(sig);
      } else {
        const ok = await rsaVerify(rsaInput, rsaSignature, rsaPublic);
        setRsaVerified(ok);
        setRsaOutput(ok ? t("crypto.verify.ok") : t("crypto.verify.fail"));
      }
    } catch (err) {
      setRsaOutput("");
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runEc = async () => {
    setBusy(true);
    setError(null);
    setEcVerified(null);
    try {
      if (ecAction === "sign") {
        const sig = await ecdsaSign(ecInput, ecPrivate, ecCurve);
        setEcSignature(sig);
        setEcOutput(sig);
      } else {
        const ok = await ecdsaVerify(ecInput, ecSignature, ecPublic, ecCurve);
        setEcVerified(ok);
        setEcOutput(ok ? t("crypto.verify.ok") : t("crypto.verify.fail"));
      }
    } catch (err) {
      setEcOutput("");
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const generateRsa = async () => {
    setBusy(true);
    setError(null);
    try {
      const pair =
        rsaAction === "sign" || rsaAction === "verify"
          ? await generateRsaSignKeyPair(rsaBits)
          : await generateRsaKeyPair(rsaBits);
      setRsaPublic(pair.publicKey);
      setRsaPrivate(pair.privateKey);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const generateEc = async () => {
    setBusy(true);
    setError(null);
    try {
      const pair = await generateEcKeyPair(ecCurve);
      setEcPublic(pair.publicKey);
      setEcPrivate(pair.privateKey);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeading icon={KeyRound}>{t("tools.tab.crypto")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("crypto.subtitle")}
      </p>

      <nav aria-label={t("crypto.tools")} className="mb-4 flex flex-wrap gap-1.5">
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
        {tool === "aes" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup
                type="single"
                value={aesAction}
                onValueChange={(v) => {
                  if (v) setAesAction(v as AesAction);
                }}
                className="gap-1.5"
              >
                <ToggleGroupItem value="encrypt" size="sm">
                  {t("crypto.action.encrypt")}
                </ToggleGroupItem>
                <ToggleGroupItem value="decrypt" size="sm">
                  {t("crypto.action.decrypt")}
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex flex-wrap gap-1.5">
                <ToggleGroup
                  type="single"
                  value={aesMode}
                  onValueChange={(v) => {
                    if (v) setAesMode(v as AesMode);
                  }}
                  className="gap-1.5"
                >
                  <ToggleGroupItem value="AES-GCM" size="sm">
                    AES-GCM
                  </ToggleGroupItem>
                  <ToggleGroupItem value="AES-CBC" size="sm">
                    AES-CBC
                  </ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  value={String(aesBits)}
                  onValueChange={(v) => {
                    if (v) setAesBits(Number(v) as AesKeyBits);
                  }}
                  className="gap-1.5"
                >
                  <ToggleGroupItem value="128" size="sm">
                    128
                  </ToggleGroupItem>
                  <ToggleGroupItem value="256" size="sm">
                    256
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("crypto.key")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[12px]"
                    onClick={() => setAesKey(generateAesKeyHex(aesBits))}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("crypto.generate")}
                  </Button>
                </div>
                <Input
                  value={aesKey}
                  onChange={(e) => setAesKey(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.keyPlaceholder")}
                  className={monoInputClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[12px] font-medium text-text-secondary">
                    {t("crypto.iv")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[12px]"
                    onClick={() => setAesIv(generateAesIvHex(aesMode))}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("crypto.generate")}
                  </Button>
                </div>
                <Input
                  value={aesIv}
                  onChange={(e) => setAesIv(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.ivPlaceholder")}
                  className={monoInputClass}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={aesInId} className="text-[12px] font-medium text-text-secondary">
                  {aesAction === "encrypt" ? t("crypto.plaintext") : t("crypto.ciphertext")}
                </Label>
                <Textarea
                  id={aesInId}
                  value={aesInput}
                  onChange={(e) => setAesInput(e.target.value)}
                  spellCheck={false}
                  placeholder={
                    aesAction === "encrypt"
                      ? t("crypto.plaintextPlaceholder")
                      : t("crypto.ciphertextPlaceholder")
                  }
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={aesOutId} className="text-[12px] font-medium text-text-secondary">
                    {t("crypto.output")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!aesOutput}
                    className="h-8 px-2 text-[12px]"
                    onClick={() => void markCopied(aesOutput)}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? t("crypto.copied") : t("crypto.copy")}
                  </Button>
                </div>
                <Textarea
                  id={aesOutId}
                  value={aesOutput}
                  readOnly
                  spellCheck={false}
                  placeholder={t("crypto.outputPlaceholder")}
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={busy || !aesInput || !aesKey || !aesIv} onClick={() => void runAes()}>
                {aesAction === "encrypt" ? t("crypto.action.encrypt") : t("crypto.action.decrypt")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAesInput("");
                  setAesOutput("");
                  setError(null);
                }}
              >
                {t("crypto.clear")}
              </Button>
              <span className="text-[12px] text-text-tertiary">{t("crypto.hint.aes")}</span>
            </div>
          </div>
        )}

        {tool === "rsa" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup
                type="single"
                value={rsaAction}
                onValueChange={(v) => {
                  if (v) {
                    setRsaAction(v as RsaAction);
                    setRsaVerified(null);
                    setError(null);
                  }
                }}
                className="gap-1.5"
              >
                <ToggleGroupItem value="encrypt" size="sm">
                  {t("crypto.action.encrypt")}
                </ToggleGroupItem>
                <ToggleGroupItem value="decrypt" size="sm">
                  {t("crypto.action.decrypt")}
                </ToggleGroupItem>
                <ToggleGroupItem value="sign" size="sm">
                  {t("crypto.action.sign")}
                </ToggleGroupItem>
                <ToggleGroupItem value="verify" size="sm">
                  {t("crypto.action.verify")}
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex flex-wrap items-center gap-1.5">
                <ToggleGroup
                  type="single"
                  value={String(rsaBits)}
                  onValueChange={(v) => {
                    if (v) setRsaBits(Number(v) as RsaModulusBits);
                  }}
                  className="gap-1.5"
                >
                  <ToggleGroupItem value="2048" size="sm">
                    2048
                  </ToggleGroupItem>
                  <ToggleGroupItem value="4096" size="sm">
                    4096
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void generateRsa()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("crypto.generateKeys")}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.publicKey")}
                </Label>
                <Textarea
                  value={rsaPublic}
                  onChange={(e) => setRsaPublic(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.pemPlaceholder")}
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.privateKey")}
                </Label>
                <Textarea
                  value={rsaPrivate}
                  onChange={(e) => setRsaPrivate(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.pemPlaceholder")}
                  className={fieldClass}
                />
              </div>
            </div>

            {rsaAction === "verify" && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.signature")}
                </Label>
                <Textarea
                  value={rsaSignature}
                  onChange={(e) => setRsaSignature(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.signaturePlaceholder")}
                  className={fieldClass}
                />
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={rsaInId} className="text-[12px] font-medium text-text-secondary">
                  {rsaAction === "decrypt" ? t("crypto.ciphertext") : t("crypto.message")}
                </Label>
                <Textarea
                  id={rsaInId}
                  value={rsaInput}
                  onChange={(e) => setRsaInput(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.messagePlaceholder")}
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={rsaOutId} className="text-[12px] font-medium text-text-secondary">
                    {t("crypto.output")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!rsaOutput}
                    className="h-8 px-2 text-[12px]"
                    onClick={() => void markCopied(rsaOutput)}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? t("crypto.copied") : t("crypto.copy")}
                  </Button>
                </div>
                <Textarea
                  id={rsaOutId}
                  value={rsaOutput}
                  readOnly
                  spellCheck={false}
                  placeholder={t("crypto.outputPlaceholder")}
                  className={`${fieldClass} ${
                    rsaVerified === true
                      ? "text-success"
                      : rsaVerified === false
                        ? "text-fail"
                        : ""
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={busy || !rsaInput} onClick={() => void runRsa()}>
                {rsaAction === "encrypt"
                  ? t("crypto.action.encrypt")
                  : rsaAction === "decrypt"
                    ? t("crypto.action.decrypt")
                    : rsaAction === "sign"
                      ? t("crypto.action.sign")
                      : t("crypto.action.verify")}
              </Button>
              <span className="text-[12px] text-text-tertiary">
                {rsaAction === "sign" || rsaAction === "verify"
                  ? t("crypto.hint.rsaSign")
                  : t("crypto.hint.rsaEncrypt")}
              </span>
            </div>
          </div>
        )}

        {tool === "ecdsa" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup
                type="single"
                value={ecAction}
                onValueChange={(v) => {
                  if (v) {
                    setEcAction(v as EcAction);
                    setEcVerified(null);
                    setError(null);
                  }
                }}
                className="gap-1.5"
              >
                <ToggleGroupItem value="sign" size="sm">
                  {t("crypto.action.sign")}
                </ToggleGroupItem>
                <ToggleGroupItem value="verify" size="sm">
                  {t("crypto.action.verify")}
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex flex-wrap items-center gap-1.5">
                <ToggleGroup
                  type="single"
                  value={ecCurve}
                  onValueChange={(v) => {
                    if (v) setEcCurve(v as EcCurve);
                  }}
                  className="gap-1.5"
                >
                  <ToggleGroupItem value="P-256" size="sm">
                    P-256
                  </ToggleGroupItem>
                  <ToggleGroupItem value="P-384" size="sm">
                    P-384
                  </ToggleGroupItem>
                  <ToggleGroupItem value="P-521" size="sm">
                    P-521
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void generateEc()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("crypto.generateKeys")}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.publicKey")}
                </Label>
                <Textarea
                  value={ecPublic}
                  onChange={(e) => setEcPublic(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.pemPlaceholder")}
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.privateKey")}
                </Label>
                <Textarea
                  value={ecPrivate}
                  onChange={(e) => setEcPrivate(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.pemPlaceholder")}
                  className={fieldClass}
                />
              </div>
            </div>

            {ecAction === "verify" && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.signature")}
                </Label>
                <Textarea
                  value={ecSignature}
                  onChange={(e) => setEcSignature(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.signaturePlaceholder")}
                  className={fieldClass}
                />
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={ecInId} className="text-[12px] font-medium text-text-secondary">
                  {t("crypto.message")}
                </Label>
                <Textarea
                  id={ecInId}
                  value={ecInput}
                  onChange={(e) => setEcInput(e.target.value)}
                  spellCheck={false}
                  placeholder={t("crypto.messagePlaceholder")}
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={ecOutId} className="text-[12px] font-medium text-text-secondary">
                    {t("crypto.output")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!ecOutput}
                    className="h-8 px-2 text-[12px]"
                    onClick={() => void markCopied(ecOutput)}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? t("crypto.copied") : t("crypto.copy")}
                  </Button>
                </div>
                <Textarea
                  id={ecOutId}
                  value={ecOutput}
                  readOnly
                  spellCheck={false}
                  placeholder={t("crypto.outputPlaceholder")}
                  className={`${fieldClass} ${
                    ecVerified === true
                      ? "text-success"
                      : ecVerified === false
                        ? "text-fail"
                        : ""
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={busy || !ecInput} onClick={() => void runEc()}>
                {ecAction === "sign" ? t("crypto.action.sign") : t("crypto.action.verify")}
              </Button>
              <span className="text-[12px] text-text-tertiary">{t("crypto.hint.ecdsa")}</span>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[12px] text-fail">
            {error}
          </p>
        )}
      </Card>
    </>
  );
}
