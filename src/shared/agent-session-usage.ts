/**
 * Token and cost totals for one AI agent conversation (one terminal pane).
 * Produced in the main process from the agent's transcript, shown in the
 * pane's status bar. Electron-free so the renderer can import the type.
 */
export interface AgentSessionUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Cache creation tokens (5-minute and 1-hour writes together). */
  cacheWriteTokens: number;
  /** Sum of the four counts above. */
  totalTokens: number;
  /**
   * Estimated USD at API list prices for the messages whose model has a known
   * price; null when no message could be priced.
   */
  costUsd: number | null;
  /** False when some messages used a model without a known price (cost is a lower bound). */
  costComplete: boolean;
  /** Models seen, most recently used first. */
  models: string[];
  /** Distinct API responses counted. */
  messages: number;
}
