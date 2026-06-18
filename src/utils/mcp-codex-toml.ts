import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type McpServerEntry = Record<string, unknown>;

const MCP_SERVER_HEADER = /^\[mcp_servers\.([^\]]+)\]$/;

/** Parse `[mcp_servers.NAME]` tables (and nested `.env`) from Codex `config.toml`. */
export function readCodexMcpServers(configPath: string): Record<string, McpServerEntry> {
  if (!existsSync(configPath)) return {};

  let text: string;
  try {
    text = readFileSync(configPath, "utf-8");
  } catch {
    return {};
  }

  const servers: Record<string, McpServerEntry> = {};
  let currentServer: string | null = null;
  let currentEnv = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const header = line.match(MCP_SERVER_HEADER);
    if (header) {
      const section = header[1]!;
      const dot = section.indexOf(".");
      if (dot === -1) {
        currentServer = section.replace(/^["']|["']$/g, "");
        currentEnv = false;
        servers[currentServer] ??= {};
      } else {
        const serverName = section.slice(0, dot).replace(/^["']|["']$/g, "");
        const sub = section.slice(dot + 1);
        currentServer = serverName;
        currentEnv = sub === "env";
        servers[currentServer] ??= {};
      }
      continue;
    }

    if (!currentServer) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    const value = parseTomlValue(line.slice(eq + 1).trim());
    const entry = servers[currentServer]!;

    if (currentEnv) {
      const env = (entry["env"] as Record<string, unknown> | undefined) ?? {};
      env[key] = value;
      entry["env"] = env;
    } else {
      entry[key] = value;
    }
  }

  return servers;
}

/** Append missing MCP servers to Codex `config.toml`. Skips names that already exist. */
export function appendCodexMcpServers(
  configPath: string,
  additions: Record<string, McpServerEntry>,
): string[] {
  const existing = readCodexMcpServers(configPath);
  const added: string[] = [];
  const blocks: string[] = [];

  for (const [name, rawEntry] of Object.entries(additions)) {
    if (existing[name]) continue;
    blocks.push(formatCodexMcpServerBlock(name, adaptMcpForCodex(rawEntry)));
    added.push(name);
  }

  if (added.length === 0) return added;

  mkdirSync(dirname(configPath), { recursive: true });

  let text = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  if (text.length > 0 && !text.endsWith("\n")) text += "\n";
  if (text.length > 0 && !text.endsWith("\n\n")) text += "\n";
  text += blocks.join("\n\n");
  if (!text.endsWith("\n")) text += "\n";

  writeFileSync(configPath, text, "utf-8");
  return added;
}

/** True when a TOML section header belongs to the given MCP server. */
function sectionBelongsToServer(section: string, name: string): boolean {
  const prefix = "mcp_servers.";
  if (!section.startsWith(prefix)) return false;
  const rest = section.slice(prefix.length);
  let serverName: string;
  if (rest.startsWith('"') || rest.startsWith("'")) {
    const quote = rest[0]!;
    const end = rest.indexOf(quote, 1);
    serverName = end === -1 ? rest.slice(1) : rest.slice(1, end);
  } else {
    const dot = rest.indexOf(".");
    serverName = dot === -1 ? rest : rest.slice(0, dot);
  }
  return serverName === name;
}

/** Remove a `[mcp_servers.NAME]` block (and its `.env` sub-table) from Codex config. */
export function removeCodexMcpServer(configPath: string, name: string): boolean {
  if (!existsSync(configPath)) return false;

  let text: string;
  try {
    text = readFileSync(configPath, "utf-8");
  } catch {
    return false;
  }

  const headerRe = /^\s*\[([^\]]+)\]\s*$/;
  const out: string[] = [];
  let removing = false;
  let removedAny = false;

  for (const line of text.split(/\r?\n/)) {
    const header = line.match(headerRe);
    if (header) {
      if (sectionBelongsToServer(header[1]!, name)) {
        removing = true;
        removedAny = true;
        continue;
      }
      removing = false;
      out.push(line);
      continue;
    }
    if (removing) continue;
    out.push(line);
  }

  if (!removedAny) return false;

  let result = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
  if (result.length > 0 && !result.endsWith("\n")) result += "\n";
  writeFileSync(configPath, result, "utf-8");
  return true;
}

/** Add or replace a single MCP server block in Codex config. */
export function upsertCodexMcpServer(
  configPath: string,
  name: string,
  entry: McpServerEntry,
): void {
  removeCodexMcpServer(configPath, name);
  appendCodexMcpServers(configPath, { [name]: entry });
}

/** Toggle the `enabled` flag of a Codex MCP server. Returns false if absent. */
export function setCodexMcpServerEnabled(
  configPath: string,
  name: string,
  enabled: boolean,
): boolean {
  const servers = readCodexMcpServers(configPath);
  const entry = servers[name];
  if (!entry) return false;
  entry["enabled"] = enabled;
  upsertCodexMcpServer(configPath, name, entry);
  return true;
}

/** Normalize a JSON MCP entry for Codex TOML output. */
export function adaptMcpForCodex(entry: McpServerEntry): McpServerEntry {
  const out: McpServerEntry = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "type") continue;
    out[key] = value;
  }
  if (out["enabled"] === undefined) out["enabled"] = true;
  return out;
}

/** Normalize a Codex MCP entry for JSON-based tools. */
export function adaptMcpFromCodex(entry: McpServerEntry): McpServerEntry {
  const out: McpServerEntry = { ...entry };
  delete out["enabled"];
  return out;
}

/** True when Codex config exists and can be read. */
export function validateCodexConfig(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  try {
    readFileSync(configPath, "utf-8");
    readCodexMcpServers(configPath);
    return true;
  } catch {
    return false;
  }
}

/** Set or replace `model = "..."` in Codex `config.toml`. */
export function setCodexModel(configPath: string, model: string): void {
  mkdirSync(dirname(configPath), { recursive: true });

  let text = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  const modelLine = `model = ${formatTomlValue(model)}`;

  if (/^model\s*=/m.test(text)) {
    text = text.replace(/^model\s*=.*$/m, modelLine);
  } else {
    if (text.length > 0 && !text.endsWith("\n")) text += "\n";
    text = `${modelLine}\n${text}`;
  }

  writeFileSync(configPath, text, "utf-8");
}

function formatCodexMcpServerBlock(name: string, entry: McpServerEntry): string {
  const env = entry["env"];
  const lines: string[] = [`[mcp_servers.${name}]`];

  for (const [key, value] of Object.entries(entry)) {
    if (key === "env") continue;
    lines.push(`${key} = ${formatTomlValue(value)}`);
  }

  if (env && typeof env === "object" && !Array.isArray(env)) {
    lines.push("");
    lines.push(`[mcp_servers.${name}.env]`);
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      lines.push(`${key} = ${formatTomlValue(value)}`);
    }
  }

  return lines.join("\n");
}

function parseTomlValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"') && raw.endsWith('"')) return unescapeTomlString(raw.slice(1, -1));
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  if (raw.startsWith("[") && raw.endsWith("]")) return parseTomlArray(raw);
  if (raw.startsWith("{") && raw.endsWith("}")) return parseTomlInlineTable(raw);
  if (/^-?\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?$/.test(raw)) {
    return Number(raw.replace(/_/g, ""));
  }
  return raw;
}

function parseTomlArray(raw: string): unknown[] {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];

  const items: unknown[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i]!)) i++;
    if (i >= inner.length) break;

    if (inner[i] === '"') {
      let j = i + 1;
      let value = "";
      while (j < inner.length) {
        const ch = inner[j]!;
        if (ch === "\\" && j + 1 < inner.length) {
          value += inner[j + 1];
          j += 2;
          continue;
        }
        if (ch === '"') break;
        value += ch;
        j++;
      }
      items.push(unescapeTomlString(value));
      i = j + 1;
      continue;
    }

    if (inner[i] === "'") {
      let j = i + 1;
      while (j < inner.length && inner[j] !== "'") j++;
      items.push(inner.slice(i + 1, j));
      i = j + 1;
      continue;
    }

    let j = i;
    while (j < inner.length && inner[j] !== ",") j++;
    items.push(parseTomlValue(inner.slice(i, j).trim()));
    i = j;
  }

  return items;
}

function parseTomlInlineTable(raw: string): Record<string, unknown> {
  const inner = raw.slice(1, -1).trim();
  const out: Record<string, unknown> = {};
  if (!inner) return out;

  const pairs = splitTomlPairs(inner);
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim().replace(/^["']|["']$/g, "");
    out[key] = parseTomlValue(pair.slice(eq + 1).trim());
  }
  return out;
}

function splitTomlPairs(inner: string): string[] {
  const pairs: string[] = [];
  let start = 0;
  let depth = 0;
  let inString: '"' | "'" | null = null;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inString) {
      if (ch === "\\" && inString === '"') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      pairs.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = inner.slice(start).trim();
  if (tail) pairs.push(tail);
  return pairs;
}

function formatTomlValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatTomlValue(item)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{ ${entries.map(([k, v]) => `${k} = ${formatTomlValue(v)}`).join(", ")} }`;
  }
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unescapeTomlString(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}
