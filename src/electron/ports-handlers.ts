import { ipcMain } from "electron";
import { platform } from "node:os";
import { run } from "../utils/exec.js";
import { analyzeHostEnv, collectHostResources } from "./host-env-snapshot.js";
import { listAllListeners } from "./ports-list.js";
import { filterListeners, isPortNumber, isProtectedPid, type PortListenerRow } from "../shared/port-listeners.js";

function protectedOpts() {
  return {
    selfPid: process.pid,
    parentPid: process.ppid || 0,
    platform: platform(),
  };
}

function parsePortArg(port: unknown): { ok: true; port: number | null } | { ok: false; error: string } {
  if (port == null || port === "") return { ok: true, port: null };
  if (typeof port === "number") {
    return isPortNumber(port) ? { ok: true, port } : { ok: false, error: "Invalid port" };
  }
  if (typeof port === "string" && /^\d+$/u.test(port.trim())) {
    const n = Number(port.trim());
    return isPortNumber(n) ? { ok: true, port: n } : { ok: false, error: "Invalid port" };
  }
  return { ok: false, error: "Invalid port" };
}

async function killPid(pid: number): Promise<{ ok: true } | { ok: false; error: string; code?: "protected" | "failed" }> {
  if (isProtectedPid(pid, protectedOpts())) {
    return { ok: false, error: "That process cannot be stopped from here.", code: "protected" };
  }
  if (platform() === "win32") {
    const result = await run("taskkill", ["/PID", String(pid), "/T", "/F"], 10_000);
    if (result.ok) return { ok: true };
    const err = result.stderr || result.stdout || "taskkill failed";
    if (/not found/iu.test(err)) return { ok: true };
    return { ok: false, error: err, code: "failed" };
  }
  try {
    process.kill(pid, "SIGKILL");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err && typeof err === "object" && "code" in err && err.code === "ESRCH") {
      return { ok: true };
    }
    return { ok: false, error: message, code: "failed" };
  }
}

function parseLocale(locale: unknown): "en" | "zh" {
  return locale === "zh" ? "zh" : "en";
}

export function registerPortsHandlers(): void {
  ipcMain.handle("ports-list", async (_event, port: unknown) => {
    const parsed = parsePortArg(port);
    if (!parsed.ok) return parsed;
    try {
      const opts = protectedOpts();
      const listeners: PortListenerRow[] = filterListeners(
        await listAllListeners(parsed.port),
        parsed.port,
      ).map((row) => ({
        ...row,
        canKill: !isProtectedPid(row.pid, opts),
      }));
      return { ok: true as const, listeners, port: parsed.port };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("ports-kill", async (_event, pid: unknown) => {
    if (typeof pid !== "number" || !Number.isInteger(pid)) {
      return { ok: false as const, error: "Invalid pid", code: "failed" as const };
    }
    return killPid(pid);
  });

  ipcMain.handle("ports-analyze-env", async (_event, locale: unknown) => {
    return analyzeHostEnv(parseLocale(locale));
  });

  ipcMain.handle("ports-host-stats", async () => {
    try {
      return { ok: true as const, stats: await collectHostResources() };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
