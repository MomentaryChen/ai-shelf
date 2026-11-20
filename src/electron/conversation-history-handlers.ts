import { ipcMain } from "electron";
import { conversationProvider, conversationProviders } from "./conversation-history-providers.js";
import type {
  ConversationSearchResult,
  ConversationSummary,
} from "../shared/conversation-history.js";

/** Max sessions a search returns. */
const SEARCH_LIMIT = 50;
const MAX_QUERY_CHARS = 200;

/** Bumped on every search; older searches see a newer value and stop. */
let searchSeq = 0;

/**
 * Conversation history IPC. The renderer passes provider + session ids only;
 * file paths are resolved here from the provider's own scan. Transcript contents
 * and parse errors are never logged.
 */
export function registerConversationHistoryHandlers(): void {
  ipcMain.handle("conversations-list", async (_event, opts: unknown) => {
    const refresh =
      !!opts && typeof opts === "object" && (opts as { refresh?: unknown }).refresh === true;
    try {
      const lists = await Promise.all(
        conversationProviders().map((p) => p.listSessions({ refresh })),
      );
      const sessions: ConversationSummary[] = lists
        .flat()
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return { success: true, sessions };
    } catch {
      return { success: false, error: "Could not read conversation history." };
    }
  });

  ipcMain.handle("conversations-read", async (_event, providerId: unknown, sessionId: unknown) => {
    const provider = conversationProvider(providerId);
    if (!provider || typeof sessionId !== "string") return { success: false, error: "Not found" };
    try {
      const detail = await provider.readSession(sessionId);
      return detail ? { success: true, detail } : { success: false, error: "Not found" };
    } catch {
      return { success: false, error: "Could not read the conversation." };
    }
  });

  ipcMain.handle("conversations-search", async (_event, query: unknown) => {
    const seq = ++searchSeq;
    const q = typeof query === "string" ? query.trim().slice(0, MAX_QUERY_CHARS) : "";
    if (!q) return { success: true, result: { hits: [], limited: false } };
    const shouldStop = () => seq !== searchSeq;
    try {
      const merged: ConversationSearchResult = { hits: [], limited: false };
      for (const provider of conversationProviders()) {
        const r = await provider.searchSessions(q, {
          limit: SEARCH_LIMIT - merged.hits.length,
          shouldStop,
        });
        merged.hits.push(...r.hits);
        merged.limited ||= r.limited;
        if (r.cancelled) return { success: true, result: { ...merged, cancelled: true } };
        if (merged.hits.length >= SEARCH_LIMIT) {
          merged.limited = true;
          break;
        }
      }
      return { success: true, result: merged };
    } catch {
      return { success: false, error: "Search failed." };
    }
  });
}
