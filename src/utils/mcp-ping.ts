import { spawn } from "node:child_process";
import { listMcpServersDetailed } from "./mcp-edit.js";
import type { McpServerEntry } from "./mcp-codex-toml.js";

/**
 * Live MCP connectivity test — performs a real JSON-RPC `initialize` handshake
 * against each configured server, rather than only validating config JSON.
 *
 * - stdio servers (have `command`): spawn the process, send `initialize` over
 *   stdin, wait for a matching response on stdout, then kill.
 * - http servers (have `url`): POST `initialize` and parse the JSON or SSE reply.
 */

export type McpTransport = "stdio" | "http" | "unknown";

export interface McpPingResult {
  name: string;
  ok: boolean;
  transport: McpTransport;
  serverName?: string;
  serverVersion?: string;
  error?: string;
  durationMs: number;
}

export interface McpPingToolResult {
  tool: string;
  configPath: string;
  results: McpPingResult[];
}

const DEFAULT_TIMEOUT = 10_000;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Quote an arg for cmd.exe when spawning through a shell (shell:true). */
function quoteWinShellArg(arg: string): string {
  return /[\s"^&|<>()]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function detectTransport(entry: McpServerEntry): McpTransport {
  if (typeof entry["command"] === "string" && entry["command"]) return "stdio";
  if (typeof entry["url"] === "string" && entry["url"]) return "http";
  return "unknown";
}

function initializeRequest(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ai-shelf", version: "doctor" },
    },
  });
}

interface JsonRpcReply {
  id?: unknown;
  error?: { message?: string };
  result?: { serverInfo?: { name?: string; version?: string } };
}

function extractServerInfo(reply: JsonRpcReply): { serverName?: string; serverVersion?: string } {
  const info = reply.result?.serverInfo;
  if (info && typeof info === "object") {
    return { serverName: info.name, serverVersion: info.version };
  }
  return {};
}

function pingStdio(
  name: string,
  entry: McpServerEntry,
  timeoutMs: number,
): Promise<McpPingResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const command = String(entry["command"]);
    const args = Array.isArray(entry["args"]) ? entry["args"].map(String) : [];
    const envEntry = entry["env"];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...(envEntry && typeof envEntry === "object" && !Array.isArray(envEntry)
        ? (envEntry as Record<string, string>)
        : {}),
    };

    // On Windows, bare commands (npx, uvx, …) are `.cmd` shims that only resolve
    // through a shell. Commands given as a path (node, absolute exe) are spawned
    // directly so paths containing spaces are not mangled by cmd.exe.
    const useShell = process.platform === "win32" && !/[\\/]/.test(command);
    const spawnCommand = useShell && /\s/.test(command) ? `"${command}"` : command;
    const spawnArgs = useShell ? args.map(quoteWinShellArg) : args;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spawnCommand, spawnArgs, {
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: useShell,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ name, ok: false, transport: "stdio", error: errMsg(err), durationMs: Date.now() - start });
      return;
    }

    let settled = false;
    let buffer = "";
    let stderr = "";

    const finish = (partial: { ok: boolean; error?: string; serverName?: string; serverVersion?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({ name, transport: "stdio", durationMs: Date.now() - start, ...partial });
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `Timed out after ${timeoutMs}ms (no initialize response)` }),
      timeoutMs,
    );

    child.on("error", (err) => finish({ ok: false, error: errMsg(err) }));
    child.on("exit", (code) =>
      finish({
        ok: false,
        error: `Process exited (code ${code}) before responding${
          stderr.trim() ? `: ${stderr.trim().slice(0, 200)}` : ""
        }`,
      }),
    );
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.stdout?.on("data", (d: Buffer) => {
      buffer += d.toString();
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let reply: JsonRpcReply;
        try {
          reply = JSON.parse(line) as JsonRpcReply;
        } catch {
          continue;
        }
        if (reply.id === 1) {
          if (reply.error) {
            finish({ ok: false, error: reply.error.message ?? "initialize error" });
          } else {
            finish({ ok: true, ...extractServerInfo(reply) });
          }
          return;
        }
      }
    });

    try {
      child.stdin?.write(initializeRequest() + "\n");
    } catch (err) {
      finish({ ok: false, error: errMsg(err) });
    }
  });
}

function parseHttpInitialize(text: string): JsonRpcReply | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Server-Sent Events: one or more `data: {...}` lines.
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split(/\r?\n/)) {
      const m = line.match(/^data:\s*(.+)$/);
      if (!m) continue;
      try {
        const reply = JSON.parse(m[1]!) as JsonRpcReply;
        if (reply.id === 1) return reply;
      } catch {
        /* keep scanning */
      }
    }
  }
  try {
    return JSON.parse(trimmed) as JsonRpcReply;
  } catch {
    return null;
  }
}

async function pingHttp(
  name: string,
  entry: McpServerEntry,
  timeoutMs: number,
): Promise<McpPingResult> {
  const start = Date.now();
  const url = String(entry["url"]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const extra = entry["headers"];
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const [k, v] of Object.entries(extra as Record<string, unknown>)) headers[k] = String(v);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: initializeRequest(),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        name,
        ok: false,
        transport: "http",
        error: `HTTP ${res.status} ${res.statusText}`,
        durationMs: Date.now() - start,
      };
    }
    const reply = parseHttpInitialize(await res.text());
    if (reply?.error) {
      return {
        name,
        ok: false,
        transport: "http",
        error: reply.error.message ?? "initialize error",
        durationMs: Date.now() - start,
      };
    }
    return {
      name,
      ok: true,
      transport: "http",
      ...(reply ? extractServerInfo(reply) : {}),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      name,
      ok: false,
      transport: "http",
      error: aborted ? `Timed out after ${timeoutMs}ms` : errMsg(err),
      durationMs: Date.now() - start,
    };
  }
}

/** Ping a single MCP server. */
export function pingMcpServer(
  name: string,
  entry: McpServerEntry,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<McpPingResult> {
  const transport = detectTransport(entry);
  if (transport === "stdio") return pingStdio(name, entry, timeoutMs);
  if (transport === "http") return pingHttp(name, entry, timeoutMs);
  return Promise.resolve({
    name,
    ok: false,
    transport: "unknown",
    error: "Server config has neither a command (stdio) nor a url (http)",
    durationMs: 0,
  });
}

/** Ping every enabled MCP server configured for a tool, concurrently. */
export async function pingToolServers(
  tool: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<McpPingToolResult> {
  const list = listMcpServersDetailed(tool);
  const enabled = list.servers.filter((s) => s.enabled);
  const results = await Promise.all(
    enabled.map((s) => pingMcpServer(s.name, s.entry, timeoutMs)),
  );
  return { tool, configPath: list.configPath, results };
}
