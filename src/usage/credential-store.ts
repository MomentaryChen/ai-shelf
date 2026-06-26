import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { USAGE_PROVIDERS } from "./registry.js";
import type { UsageCredentialStatus, UsageToolId } from "./types.js";

const FILE = "usage-credentials.enc.json";

interface StoredFile {
  version: 1;
  tools: Record<string, Record<string, string>>;
}

function filePath(): string {
  return join(app.getPath("userData"), FILE);
}

export function isUsageEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

function readStore(): StoredFile {
  try {
    const path = filePath();
    if (!existsSync(path)) return { version: 1, tools: {} };
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as StoredFile;
    if (parsed?.version !== 1 || typeof parsed.tools !== "object") {
      return { version: 1, tools: {} };
    }
    return parsed;
  } catch {
    return { version: 1, tools: {} };
  }
}

function writeStore(data: StoredFile): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath(), JSON.stringify(data, null, 2), "utf-8");
}

function encryptValue(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable on this system");
  }
  return safeStorage.encryptString(plain).toString("base64");
}

function decryptValue(encoded: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable on this system");
  }
  return safeStorage.decryptString(Buffer.from(encoded, "base64"));
}

function maskHint(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function listUsageCredentialStatus(): UsageCredentialStatus[] {
  const store = readStore();
  return USAGE_PROVIDERS.map((provider) => {
    const toolFields = store.tools[provider.toolId] ?? {};
    const methods: UsageCredentialStatus["methods"] = [];

    for (const field of provider.fields) {
      const encoded = toolFields[field.key];
      if (!encoded || !safeStorage.isEncryptionAvailable()) continue;
      try {
        const plain = decryptValue(encoded);
        if (!plain.trim()) continue;
        methods.push({
          fieldKey: field.key,
          labelKey: field.groupLabelKey ?? field.labelKey ?? field.key,
          maskedHint: maskHint(plain),
        });
      } catch {
        /* skip invalid entry */
      }
    }

    return {
      toolId: provider.toolId,
      configured: isUsageToolConfigured(provider.toolId),
      maskedHint: methods.map((m) => m.maskedHint).filter(Boolean).join(" · ") || undefined,
      methods,
    };
  });
}

export function isUsageToolConfigured(toolId: UsageToolId): boolean {
  if (toolId === "claude") {
    return !!(
      getUsageCredential("claude", "adminApiKey")?.trim() ||
      getUsageCredential("claude", "sessionKey")?.trim()
    );
  }
  if (toolId === "gemini") {
    return !!(
      getUsageCredential("gemini", "serviceAccountJson")?.trim() ||
      getUsageCredential("gemini", "apiKey")?.trim()
    );
  }
  if (toolId === "copilot") {
    return !!getUsageCredential("copilot", "pat")?.trim();
  }
  const provider = USAGE_PROVIDERS.find((p) => p.toolId === toolId);
  if (!provider) return false;
  return provider.fields.some((field) => {
    const value = getUsageCredential(toolId, field.key);
    return !!value?.trim();
  });
}

export function getUsageCredential(toolId: UsageToolId, fieldKey: string): string | null {
  const store = readStore();
  const encoded = store.tools[toolId]?.[fieldKey];
  if (!encoded) return null;
  try {
    return decryptValue(encoded);
  } catch {
    return null;
  }
}

export function setUsageCredential(
  toolId: UsageToolId,
  fieldKey: string,
  value: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return clearUsageCredentialField(toolId, fieldKey);
  }
  if (!getUsageProviderField(toolId, fieldKey)) {
    return { ok: false, error: `Unknown credential field: ${fieldKey}` };
  }
  try {
    const store = readStore();
    const tools = { ...store.tools };
    const fields = { ...(tools[toolId] ?? {}) };
    fields[fieldKey] = encryptValue(trimmed);
    tools[toolId] = fields;
    writeStore({ version: 1, tools });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

export function clearUsageCredentialField(
  toolId: UsageToolId,
  fieldKey: string,
): { ok: true } | { ok: false; error: string } {
  const store = readStore();
  const tools = { ...store.tools };
  const fields = { ...(tools[toolId] ?? {}) };
  delete fields[fieldKey];
  if (Object.keys(fields).length === 0) delete tools[toolId];
  else tools[toolId] = fields;
  writeStore({ version: 1, tools });
  return { ok: true };
}

export function clearUsageCredentials(toolId: UsageToolId): { ok: true } {
  const store = readStore();
  const tools = { ...store.tools };
  delete tools[toolId];
  writeStore({ version: 1, tools });
  return { ok: true };
}

function getUsageProviderField(toolId: UsageToolId, fieldKey: string): boolean {
  const provider = USAGE_PROVIDERS.find((p) => p.toolId === toolId);
  return !!provider?.fields.some((f) => f.key === fieldKey);
}
