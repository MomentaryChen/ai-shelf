import { ipcMain } from "electron";
import {
  clearUsageCredentials,
  getUsageCredential,
  isUsageEncryptionAvailable,
  isUsageToolConfigured,
  listUsageCredentialStatus,
  setUsageCredential,
} from "../usage/credential-store.js";
import { fetchUsageDashboard } from "../usage/fetch-dashboard.js";
import { fetchClaudeAdminUsage } from "../usage/providers/claude.js";
import { fetchCopilotUsage, testCopilotPat } from "../usage/providers/copilot.js";
import { fetchCursorAdminUsage } from "../usage/providers/cursor.js";
import { fetchClaudeDashboardUsage, testClaudeDashboardSession } from "../usage/providers/claude-dashboard.js";
import { fetchCursorDashboardUsage, testCursorDashboardSession } from "../usage/providers/cursor-dashboard.js";
import { testGeminiApiKey, testGeminiGcpCredentials } from "../usage/providers/gemini.js";
import { USAGE_PROVIDERS } from "../usage/registry.js";
import type { UsageToolId } from "../usage/types.js";

function asToolId(tool: unknown): UsageToolId | null {
  if (typeof tool !== "string") return null;
  return USAGE_PROVIDERS.some((p) => p.toolId === tool) ? (tool as UsageToolId) : null;
}

export function registerUsageHandlers(): void {
  ipcMain.handle("usage-get-providers", () => ({
    providers: USAGE_PROVIDERS,
    encryptionAvailable: isUsageEncryptionAvailable(),
  }));

  ipcMain.handle("usage-get-credential-status", () => ({
    statuses: listUsageCredentialStatus(),
    encryptionAvailable: isUsageEncryptionAvailable(),
  }));

  ipcMain.handle(
    "usage-set-credential",
    (_event, tool: unknown, fieldKey: unknown, value: unknown) => {
      const toolId = asToolId(tool);
      if (!toolId || typeof fieldKey !== "string") {
        return { ok: false, error: "Invalid tool or field" };
      }
      if (typeof value !== "string") return { ok: false, error: "Invalid value" };
      return setUsageCredential(toolId, fieldKey, value);
    },
  );

  ipcMain.handle("usage-clear-credential", (_event, tool: unknown) => {
    const toolId = asToolId(tool);
    if (!toolId) return { ok: false, error: "Invalid tool" };
    clearUsageCredentials(toolId);
    return { ok: true };
  });

  ipcMain.handle("usage-test-credential", async (_event, tool: unknown, fieldKey?: unknown) => {
    const toolId = asToolId(tool);
    if (!toolId) return { ok: false, error: "Invalid tool" };
    const provider = USAGE_PROVIDERS.find((p) => p.toolId === toolId);
    if (!provider?.supported) return { ok: false, error: provider?.unsupportedReason ?? "Unsupported" };

    if (typeof fieldKey === "string" && fieldKey) {
      const secret = getUsageCredential(toolId, fieldKey);
      if (!secret?.trim()) return { ok: false, error: "No credential saved" };
      try {
        if (toolId === "cursor") {
          if (fieldKey === "sessionToken") {
            await testCursorDashboardSession(secret);
          } else if (fieldKey === "adminApiKey") {
            await fetchCursorAdminUsage(secret, 7);
          } else {
            return { ok: false, error: "Unknown credential field" };
          }
          return { ok: true };
        }
        if (toolId === "claude") {
          if (fieldKey === "sessionKey" || fieldKey === "cfClearance" || fieldKey === "orgId") {
            const savedSession = getUsageCredential("claude", "sessionKey");
            if (fieldKey !== "sessionKey" && !savedSession?.trim()) {
              return { ok: false, error: "Save session cookie first" };
            }
            await testClaudeDashboardSession({
              sessionKey: fieldKey === "sessionKey" ? secret : (savedSession ?? ""),
              orgId: fieldKey === "orgId" ? secret : getUsageCredential("claude", "orgId"),
              cfClearance:
                fieldKey === "cfClearance" ? secret : getUsageCredential("claude", "cfClearance"),
            });
          } else if (fieldKey === "adminApiKey") {
            await fetchClaudeAdminUsage(secret, 7);
          } else {
            return { ok: false, error: "Unknown credential field" };
          }
          return { ok: true };
        }
        if (toolId === "gemini") {
          if (fieldKey === "serviceAccountJson") {
            const projectId = getUsageCredential("gemini", "projectId");
            await testGeminiGcpCredentials(secret, projectId);
          } else if (fieldKey === "apiKey") {
            await testGeminiApiKey(secret);
          } else if (fieldKey === "projectId") {
            const sa = getUsageCredential("gemini", "serviceAccountJson");
            if (!sa?.trim()) {
              return { ok: false, error: "Save service account JSON first" };
            }
            await testGeminiGcpCredentials(sa, secret);
          } else {
            return { ok: false, error: "Unknown credential field" };
          }
          return { ok: true };
        }
        if (toolId === "copilot") {
          if (fieldKey === "pat") {
            await testCopilotPat(secret);
          } else if (fieldKey === "org" || fieldKey === "enterprise") {
            const pat = getUsageCredential("copilot", "pat");
            if (!pat?.trim()) {
              return { ok: false, error: "Save personal access token first" };
            }
            await fetchCopilotUsage(
              {
                pat,
                org: fieldKey === "org" ? secret : getUsageCredential("copilot", "org"),
                enterprise: fieldKey === "enterprise" ? secret : getUsageCredential("copilot", "enterprise"),
              },
              7,
            );
          } else {
            return { ok: false, error: "Unknown credential field" };
          }
          return { ok: true };
        }
      } catch (err: unknown) {
        return { ok: false, error: (err as Error).message };
      }
    } else if (!isUsageToolConfigured(toolId)) {
      return { ok: false, error: "No credential saved" };
    }

    try {
      const result = await fetchUsageDashboard({ days: 7 });
      const snap = result.tools.find((t) => t.toolId === toolId);
      if (snap?.status === "ok") return { ok: true };
      return { ok: false, error: snap?.error ?? "Credential test failed" };
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("usage-fetch-dashboard", async (_event, opts?: { days?: number }) => {
    try {
      const dashboard = await fetchUsageDashboard({ days: opts?.days });
      return { ok: true as const, dashboard };
    } catch (err: unknown) {
      return { ok: false as const, error: (err as Error).message };
    }
  });
}
