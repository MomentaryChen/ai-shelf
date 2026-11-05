import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FLOW_CHAT_DRAFT_ID } from "../../shared/flow-chat-types.js";
import type { FlowChatMessage } from "../../shared/flow-chat-types.js";
import { parseFlowDocument } from "../../shared/flow-parse.js";
import { formatFlowValidationIssues, validateFlowDefinition } from "../../shared/flow-validate.js";
import { useLocale } from "../i18n/LocaleProvider";
import { shouldIgnoreShortcutForIme } from "../terminal/ime-keys";
import { LoadingRow } from "./WarmTypingDots";

type UiMessage = FlowChatMessage & { draft?: string; error?: boolean };

interface Props {
  /** Existing flow id, or omit for new draft (`__draft__`). */
  flowId?: string;
  onSaved: (flowId: string) => void;
  onCancel?: () => void;
}

const SUGGESTION_KEYS = [
  "flow.create.suggestion.dailyReport",
  "flow.create.suggestion.prReview",
  "flow.create.suggestion.syncFolder",
] as const;

const INPUT_MAX_HEIGHT_PX = 160;

function welcomeMessage(welcomeText: string): UiMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: welcomeText,
    createdAt: new Date().toISOString(),
  };
}

export function FlowCreateChat({ flowId, onSaved, onCancel }: Props) {
  const { t } = useLocale();
  const chatKey = flowId?.trim() || FLOW_CHAT_DRAFT_ID;
  const isExisting = Boolean(flowId?.trim());

  const [messages, setMessages] = useState<UiMessage[]>([welcomeMessage(t("flow.create.welcome"))]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [promptLogCount, setPromptLogCount] = useState(0);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasUserMessages = useMemo(
    () => messages.some((m) => m.role === "user" && m.id !== "welcome"),
    [messages],
  );

  const showSuggestions = !loadingChat && !generating && !hasUserMessages;

  const draftValidation = useMemo(() => {
    if (!draft?.trim()) return null;
    const parsed = parseFlowDocument(draft, "draft.flow.md", "");
    if ("error" in parsed) return { ok: false as const, text: parsed.error };
    const issues = validateFlowDefinition(parsed);
    if (issues.length > 0) {
      return { ok: false as const, text: formatFlowValidationIssues(issues) };
    }
    return { ok: true as const, id: parsed.id, phases: parsed.phases.length };
  }, [draft]);

  const persistChat = useCallback(
    async (next: UiMessage[]) => {
      const toSave = next
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          draft: m.draft,
          error: m.error,
          createdAt: m.createdAt ?? new Date().toISOString(),
        }));
      await window.api.flowSaveChat(chatKey, toSave);
    },
    [chatKey],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingChat(true);
    setDraft(null);
    setMessages([welcomeMessage(t("flow.create.welcome"))]);
    const diskPromise =
      isExisting && flowId ? window.api.flowReadFile(flowId) : Promise.resolve(null);
    void Promise.all([
      window.api.flowGetChat(chatKey),
      window.api.flowListPromptLogs(chatKey, 200),
      diskPromise,
    ])
      .then(([stored, logs, diskFile]) => {
        if (cancelled) return;
        if (stored && stored.length > 0) {
          setMessages([welcomeMessage(t("flow.create.welcome")), ...stored]);
          const lastDraft = [...stored].reverse().find((m) => m.draft)?.draft;
          if (lastDraft) {
            setDraft(lastDraft);
          } else if (diskFile?.content) {
            setDraft(diskFile.content);
          }
        } else if (diskFile?.content) {
          setDraft(diskFile.content);
        }
        setPromptLogCount(logs.length);
      })
      .finally(() => {
        if (!cancelled) setLoadingChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatKey, flowId, isExisting, t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, generating]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [input]);

  useEffect(() => {
    if (!loadingChat) inputRef.current?.focus({ preventScroll: true });
  }, [loadingChat, chatKey]);

  /** Users + a single latest draft — older assistant drafts stay in UI only. */
  const turnsForApi = useCallback(() => {
    const relevant = messages.filter((m) => m.id !== "welcome" && !m.error);
    const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
    let lastDraft: string | null = null;
    for (const m of relevant) {
      if (m.role === "user") {
        turns.push({ role: "user", content: m.content });
      } else if (m.draft?.trim()) {
        lastDraft = m.draft;
      }
    }
    if (lastDraft) turns.push({ role: "assistant", content: lastDraft });
    return turns;
  }, [messages]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || generating || loadingChat) return;

    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    void persistChat(nextMessages);
    setInput("");
    setGenerating(true);
    setSaveError(null);
    setDraft(null);

    const turns = [...turnsForApi(), { role: "user" as const, content: text }];
    const res = await window.api.flowGenerate(turns, chatKey);
    setGenerating(false);

    if (!res.ok || !res.content) {
      const withErr: UiMessage[] = [
        ...nextMessages,
        {
          id: `a-err-${Date.now()}`,
          role: "assistant",
          content: res.error ?? t("flow.create.generateFailed"),
          error: true,
          createdAt: new Date().toISOString(),
        },
      ];
      setMessages(withErr);
      void persistChat(withErr);
      return;
    }

    setDraft(res.content);
    setPromptLogCount((c) => c + 1);
    const parsed = parseFlowDocument(res.content, "draft.flow.md", "");
    const issues = "error" in parsed ? [] : validateFlowDefinition(parsed);
    const summary =
      "error" in parsed
        ? t("flow.create.draftReady")
        : issues.length > 0
          ? t("flow.create.draftInvalid", { issues: formatFlowValidationIssues(issues) })
          : t("flow.create.draftSummary", { id: parsed.id, phases: parsed.phases.length });

    const withAssistant: UiMessage[] = [
      ...nextMessages,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: summary,
        draft: res.content,
        createdAt: new Date().toISOString(),
      },
    ];
    setMessages(withAssistant);
    void persistChat(withAssistant);
  };

  const saveDraft = async (overwrite = false) => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    const res = await window.api.flowCreate(draft, {
      overwrite: overwrite || isExisting,
      migrateChatFromDraft: chatKey === FLOW_CHAT_DRAFT_ID,
    });
    setSaving(false);
    if (!res.ok) {
      if (!overwrite && res.error?.includes("already exists")) {
        setSaveError(t("flow.create.existsHint"));
        return;
      }
      setSaveError(res.error ?? t("flow.create.saveFailed"));
      return;
    }
    if (res.flowId) onSaved(res.flowId);
  };

  const clearConversation = async () => {
    if (generating) return;
    await window.api.flowClearChat(chatKey);
    setMessages([welcomeMessage(t("flow.create.welcome"))]);
    setSaveError(null);
    if (isExisting && flowId) {
      const file = await window.api.flowReadFile(flowId);
      setDraft(file?.content ?? null);
    } else {
      setDraft(null);
    }
    inputRef.current?.focus({ preventScroll: true });
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 2000);
    } catch {
      setCopyOk(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldIgnoreShortcutForIme(e.nativeEvent)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold text-text-primary">
            {isExisting ? t("flow.create.editTitle", { id: flowId! }) : t("flow.create.title")}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("flow.create.subtitle")}</p>
          <p className="mt-1 text-[11px] text-text-secondary">{t("flow.create.inputHint")}</p>
          {promptLogCount > 0 && (
            <p className="mt-1 text-[11px] text-text-secondary">
              {t("flow.chat.promptLogCount", { count: promptLogCount })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUserMessages && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-[22px] text-text-secondary"
              disabled={generating || loadingChat}
              onClick={() => void clearConversation()}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t("flow.chat.clear")}
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" className="rounded-[22px]" onClick={onCancel}>
              {t("flow.create.cancel")}
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col gap-2 lg:min-h-[240px]">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-border bg-bg-secondary p-5 shadow-card"
          >
            {loadingChat ? (
              <LoadingRow label={t("flow.chat.loading")} className="justify-center py-8" />
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={cn("warm-rise flex", isUser ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] px-4 py-3 text-[15px] leading-relaxed lg:max-w-[78%]",
                        isUser
                          ? "rounded-[20px] rounded-br-[6px] bg-primary text-primary-foreground shadow-card"
                          : msg.error
                            ? "rounded-[20px] rounded-bl-[6px] border border-fail/30 bg-fail/10 text-fail"
                            : "rounded-[20px] rounded-bl-[6px] bg-bg-card text-text-primary",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              })
            )}
            {generating && (
              <div className="flex justify-start">
                <div className="rounded-[20px] rounded-bl-[6px] bg-bg-card px-4 py-3">
                  <LoadingRow label={t("flow.create.generating")} />
                </div>
              </div>
            )}
            {showSuggestions && (
              <div className="flex flex-col gap-2 pt-2">
                <p className="text-[12px] text-text-secondary">{t("flow.create.suggestionsTitle")}</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTION_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="rounded-[22px] border border-border bg-bg-card px-4 py-2.5 text-left text-[13px] leading-snug text-text-primary transition-colors hover:border-accent/40 hover:bg-bg-elevated"
                      onClick={() => void send(t(key))}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("flow.create.placeholder")}
              disabled={generating || loadingChat}
              rows={2}
              className="min-h-[52px] max-h-40 flex-1 resize-none rounded-[22px] border-border bg-bg-primary text-[15px] text-text-primary placeholder:text-text-secondary focus-visible:ring-accent/35"
            />
            <Button
              type="button"
              size="icon"
              aria-label={t("flow.create.send")}
              disabled={generating || loadingChat || !input.trim()}
              onClick={() => void send()}
              className="h-11 w-11 shrink-0 rounded-full active:scale-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-border bg-bg-secondary shadow-card lg:min-h-[200px]">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[13px] font-medium text-text-primary">{t("flow.create.previewTitle")}</h2>
              {draft && draftValidation && (
                <p
                  className={cn(
                    "mt-0.5 text-[11px] leading-snug",
                    draftValidation.ok ? "text-success" : "text-fail whitespace-pre-wrap",
                  )}
                >
                  {draftValidation.ok
                    ? t("flow.create.previewValid", {
                        id: draftValidation.id,
                        phases: draftValidation.phases,
                      })
                    : draftValidation.text}
                </p>
              )}
              {!draft && !generating && (
                <p className="mt-0.5 text-[11px] text-text-secondary">{t("flow.create.previewEmpty")}</p>
              )}
              {generating && (
                <p className="mt-0.5 text-[11px] text-text-secondary">{t("flow.create.previewGenerating")}</p>
              )}
            </div>
            {draft && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-[22px]"
                onClick={() => void copyDraft()}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {copyOk ? t("flow.create.copied") : t("flow.create.copy")}
              </Button>
            )}
          </div>
          <pre
            className={cn(
              "min-h-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-text-primary",
              draft ? "bg-bg-primary" : "bg-bg-secondary text-text-secondary",
            )}
          >
            {generating && !draft
              ? t("flow.create.previewGenerating")
              : (draft ?? t("flow.create.previewPlaceholder"))}
          </pre>
          {draft && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <span className="text-[13px] text-text-secondary">{t("flow.create.previewHint")}</span>
              <div className="ml-auto flex flex-wrap gap-2">
                {!isExisting && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-[22px]"
                    disabled={saving || draftValidation?.ok === false}
                    onClick={() => void saveDraft(true)}
                  >
                    {t("flow.create.overwrite")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="rounded-[22px]"
                  disabled={saving || draftValidation?.ok === false}
                  onClick={() => void saveDraft(isExisting)}
                >
                  {saving ? t("flow.create.saving") : isExisting ? t("flow.create.update") : t("flow.create.save")}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {saveError && (
        <p className="shrink-0 whitespace-pre-wrap rounded-[20px] border border-fail/30 bg-fail/10 px-4 py-2 text-[13px] text-fail">
          {saveError}
        </p>
      )}
    </div>
  );
}
