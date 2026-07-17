import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FLOW_CHAT_DRAFT_ID } from "../../shared/flow-chat-types.js";
import type { FlowChatMessage } from "../../shared/flow-chat-types.js";
import { parseFlowDocument } from "../../shared/flow-parse.js";
import { useLocale } from "../i18n/LocaleProvider";

type UiMessage = FlowChatMessage & { draft?: string; error?: boolean };

interface Props {
  /** Existing flow id, or omit for new draft (`__draft__`). */
  flowId?: string;
  onSaved: (flowId: string) => void;
  onCancel?: () => void;
}

function welcomeMessage(welcomeText: string): UiMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: welcomeText,
    createdAt: new Date().toISOString(),
  };
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-text-tertiary motion-safe:animate-[warm-dot-blink_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
      isExisting && flowId
        ? window.api.flowReadFile(flowId)
        : Promise.resolve(null);
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
          // Editing an existing flow with no prior chat: seed preview from disk.
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
  }, [messages, generating, draft]);

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

  const send = async () => {
    const text = input.trim();
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
    const summary =
      "error" in parsed
        ? t("flow.create.draftReady")
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
    // One chat line per flow: migrate __draft__ → id only when this session is the draft.
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h1 className="text-[17px] font-semibold text-text-primary">
            {isExisting ? t("flow.create.editTitle", { id: flowId! }) : t("flow.create.title")}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("flow.create.subtitle")}</p>
          {promptLogCount > 0 && (
            <p className="mt-1 text-[11px] text-text-secondary">
              {t("flow.chat.promptLogCount", { count: promptLogCount })}
            </p>
          )}
        </div>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" className="rounded-[22px]" onClick={onCancel}>
            {t("flow.create.cancel")}
          </Button>
        )}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-border bg-bg-secondary p-5 shadow-card"
      >
        {loadingChat ? (
          <p className="py-8 text-center text-[13px] text-text-secondary">{t("flow.chat.loading")}</p>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`warm-rise flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] px-4 py-3 text-[15px] leading-relaxed ${
                    isUser
                      ? "rounded-[20px] rounded-br-[6px] bg-primary text-primary-foreground shadow-card"
                      : msg.error
                        ? "rounded-[20px] rounded-bl-[6px] border border-fail/30 bg-fail/10 text-fail"
                        : "rounded-[20px] rounded-bl-[6px] bg-bg-card text-text-primary"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.draft && (
                    <pre className="mt-3 max-h-48 overflow-auto rounded-[16px] bg-bg-primary p-3 font-mono text-[11px] leading-relaxed text-text-primary">
                      {msg.draft}
                    </pre>
                  )}
                </div>
              </div>
            );
          })
        )}
        {generating && (
          <div className="flex justify-start">
            <div className="rounded-[20px] rounded-bl-[6px] bg-bg-card px-4 py-3 text-text-primary">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-border bg-bg-secondary px-4 py-3">
          <span className="text-[13px] text-text-secondary">{t("flow.create.previewHint")}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {!isExisting && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-[22px]"
                disabled={saving}
                onClick={() => void saveDraft(true)}
              >
                {t("flow.create.overwrite")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="rounded-[22px]"
              disabled={saving}
              onClick={() => void saveDraft(isExisting)}
            >
              {saving ? t("flow.create.saving") : isExisting ? t("flow.create.update") : t("flow.create.save")}
            </Button>
          </div>
        </div>
      )}
      {saveError && (
        <p className="rounded-[20px] border border-fail/30 bg-fail/10 px-4 py-2 text-[13px] text-fail">
          {saveError}
        </p>
      )}

      <div className="flex shrink-0 items-end gap-2">
        <Textarea
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
    </div>
  );
}
