import {
  FLOW_DEFINITION_SCHEMA,
  type FlowDefinition,
  type FlowDesktopNotifyMode,
  type FlowNotifyEvent,
  type FlowPhaseBranch,
  type FlowPhaseDef,
  type FlowPhaseKind,
  type FlowWebhookDef,
  type FlowWebhookMethod,
} from "./flow-types.js";

const PHASE_TAG_RE = /【([a-z0-9][a-z0-9_-]*)】/gi;

function slugLabel(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function extractPhaseIdsFromBody(body: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(PHASE_TAG_RE)) {
    const id = match[1]!.toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function parsePhaseKind(raw: unknown): FlowPhaseKind | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "agent" || v === "gate" || v === "http") return v;
  return undefined;
}

function parsePhaseBranch(raw: unknown): FlowPhaseBranch | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  return v || undefined;
}

function parsePhaseFields(rec: Record<string, unknown>, id: string, label: string): FlowPhaseDef {
  const phase: FlowPhaseDef = { id, label };
  const kind = parsePhaseKind(rec.kind);
  if (kind) phase.kind = kind;
  if (typeof rec.tool === "string" && rec.tool.trim()) phase.tool = rec.tool.trim();
  if (typeof rec.tool_args === "string" && rec.tool_args.trim()) {
    phase.toolArgs = rec.tool_args.trim();
  }
  if (typeof rec.timeout_sec === "number" && rec.timeout_sec > 0) {
    phase.timeoutSec = rec.timeout_sec;
  }
  if (typeof rec.retry === "number" && rec.retry >= 0) {
    phase.retry = Math.floor(rec.retry);
  }
  const onFail = parsePhaseBranch(rec.on_fail);
  if (onFail) phase.onFail = onFail;
  if (rec.require_approval === true) phase.requireApproval = true;
  if (typeof rec.next === "string") phase.next = rec.next.trim();
  const onReject = parsePhaseBranch(rec.on_reject);
  if (onReject) phase.onReject = onReject;
  const dependsOn = parseIdListField(rec.depends_on);
  if (dependsOn) phase.dependsOn = dependsOn;
  if (typeof rec.profile === "string" && rec.profile.trim()) phase.profileId = rec.profile.trim();
  return phase;
}

/** `depends_on: [a, b]`, `depends_on: a, b`, or a nested `- a` list. `[]` = explicit root. */
function parseIdListField(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  }
  if (typeof raw === "string") {
    const items = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function parsePhasesFromFrontmatter(raw: unknown): FlowPhaseDef[] {
  if (!Array.isArray(raw)) return [];
  const phases: FlowPhaseDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id) continue;
    const label =
      typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : slugLabel(id);
    phases.push(parsePhaseFields(rec, id, label));
  }
  return phases;
}

/** Reverse of formatYamlScalar: strip matching quotes and unescape \\ and \" inside double quotes. */
function unquoteYamlScalar(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

function parseYamlStringList(lines: string[], startIndex: number): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith("  ")) break;
    const itemMatch = /^\s+-\s+(.+)$/.exec(line);
    if (itemMatch) {
      items.push(unquoteYamlScalar(itemMatch[1]!.trim()));
    }
    i += 1;
  }
  return { items, nextIndex: i };
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidFlowEnvKey(key: string): boolean {
  return ENV_KEY_RE.test(key);
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Scalar value inside a nested block: bool / int / inline `[a, b]` list / (un)quoted string. */
function parseNestedScalar(rest: string): unknown {
  if (rest === "true" || rest === "false") return rest === "true";
  if (/^-?\d+$/.test(rest)) return Number(rest);
  if (rest.startsWith("[") && rest.endsWith("]")) {
    return rest
      .slice(1, -1)
      .split(",")
      .map((v) => unquoteYamlScalar(v.trim()))
      .filter(Boolean);
  }
  return unquoteYamlScalar(rest);
}

/**
 * Parse an indented list of mappings (`phases:` / `webhooks:`):
 *
 * ```yaml
 *   - id: a
 *     depends_on:
 *       - b
 * ```
 */
function parseYamlObjectList(
  lines: string[],
  startIndex: number,
): { items: Record<string, unknown>[]; nextIndex: number } {
  const items: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;
  let itemIndent = -1;
  let pendingListKey: string | null = null;
  let i = startIndex;

  const closePendingList = () => {
    if (current && pendingListKey) {
      const v = current[pendingListKey];
      if (Array.isArray(v) && v.length === 0) delete current[pendingListKey];
    }
    pendingListKey = null;
  };

  const setField = (key: string, rest: string) => {
    if (!current) return;
    if (rest === "") {
      current[key] = [];
      pendingListKey = key;
      return;
    }
    current[key] = parseNestedScalar(rest);
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (!/^\s/.test(line)) break;
    const indent = indentOf(line);

    const itemMatch = /^\s*-\s+([a-zA-Z0-9_]+):\s*(.*)$/.exec(line);
    if (itemMatch && (itemIndent < 0 || indent === itemIndent)) {
      closePendingList();
      if (current) items.push(current);
      current = {};
      itemIndent = indent;
      setField(itemMatch[1]!, itemMatch[2]!.trim());
      i += 1;
      continue;
    }

    if (current && indent > itemIndent) {
      const listItem = /^\s*-\s+(.+)$/.exec(line);
      if (listItem && pendingListKey) {
        (current[pendingListKey] as unknown[]).push(unquoteYamlScalar(listItem[1]!.trim()));
        i += 1;
        continue;
      }
      const fieldMatch = /^\s*([a-zA-Z0-9_]+):\s*(.*)$/.exec(line);
      if (fieldMatch) {
        closePendingList();
        setField(fieldMatch[1]!, fieldMatch[2]!.trim());
      }
    }
    i += 1;
  }
  closePendingList();
  if (current) items.push(current);
  return { items, nextIndex: i };
}

/** Parse an indented `KEY: value` map (`env:`). */
function parseYamlStringMap(
  lines: string[],
  startIndex: number,
): { map: Record<string, string>; nextIndex: number } {
  const map: Record<string, string> = {};
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (!/^\s/.test(line)) break;
    const m = /^\s+([^:\s]+):\s*(.*)$/.exec(line);
    if (m) map[m[1]!] = unquoteYamlScalar(m[2]!.trim());
    i += 1;
  }
  return { map, nextIndex: i };
}

const WEBHOOK_METHODS = new Set<FlowWebhookMethod>(["POST", "PUT", "PATCH", "GET"]);

function parseNotifyEvents(raw: unknown): FlowNotifyEvent[] {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out = new Set<FlowNotifyEvent>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const key = v.trim().toLowerCase();
    if (key === "success" || key === "completed") out.add("success");
    else if (key === "failure" || key === "failed" || key === "fail") out.add("failure");
    else if (key === "both" || key === "all" || key === "always") {
      out.add("success");
      out.add("failure");
    }
  }
  return out.size > 0 ? [...out] : ["success", "failure"];
}

function parseWebhooks(raw: unknown): FlowWebhookDef[] | { error: string } | undefined {
  if (!Array.isArray(raw)) return undefined;
  const hooks: FlowWebhookDef[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!url) return { error: `webhooks[${index}]: 'url' is required` };
    const methodRaw = typeof rec.method === "string" ? rec.method.trim().toUpperCase() : "POST";
    if (!WEBHOOK_METHODS.has(methodRaw as FlowWebhookMethod)) {
      return { error: `webhooks[${index}]: 'method' must be POST, PUT, PATCH or GET` };
    }
    const hook: FlowWebhookDef = {
      url,
      method: methodRaw as FlowWebhookMethod,
      on: parseNotifyEvents(rec.on),
    };
    if (typeof rec.payload === "string" && rec.payload.trim()) hook.payload = rec.payload;
    if (typeof rec.content_type === "string" && rec.content_type.trim()) {
      hook.contentType = rec.content_type.trim();
    }
    if (typeof rec.authorization === "string" && rec.authorization.trim()) {
      hook.authorization = rec.authorization.trim();
    }
    hooks.push(hook);
  }
  return hooks.length > 0 ? hooks : undefined;
}

function parseDesktopNotify(raw: unknown): FlowDesktopNotifyMode {
  if (typeof raw !== "string") return "all";
  const v = raw.trim().toLowerCase();
  if (v === "success" || v === "failure" || v === "none") return v;
  if (v === "failed" || v === "fail") return "failure";
  if (v === "never" || v === "off") return "none";
  return "all";
}

function parsePositiveInt(raw: unknown, max: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.min(Math.floor(raw), max);
}

function parseStringListField(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

const HTTP_FLOW_METHODS = new Set(["GET", "HEAD"]);

export function isValidHttpFlowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseHttpMethod(raw: unknown): "GET" | "HEAD" | { error: string } {
  if (raw === undefined || raw === null || raw === "") return "HEAD";
  if (typeof raw !== "string") {
    return { error: "Frontmatter field 'method' must be GET or HEAD" };
  }
  const method = raw.trim().toUpperCase();
  if (HTTP_FLOW_METHODS.has(method)) return method as "GET" | "HEAD";
  return { error: `Frontmatter field 'method' must be GET or HEAD (got '${raw.trim()}')` };
}

function parseSimpleFrontmatter(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const keyMatch = /^([a-zA-Z0-9_]+):\s*(.*)$/.exec(line);
    if (!keyMatch) {
      i += 1;
      continue;
    }
    const key = keyMatch[1]!;
    const rest = keyMatch[2]!.trim();

    if ((key === "phases" || key === "webhooks") && rest === "") {
      const { items, nextIndex } = parseYamlObjectList(lines, i + 1);
      result[key] = items;
      i = nextIndex;
      continue;
    }

    if (key === "env" && rest === "") {
      const { map, nextIndex } = parseYamlStringMap(lines, i + 1);
      result[key] = map;
      i = nextIndex;
      continue;
    }

    if ((key === "extra_mcp_servers" || key === "allowed_tools") && rest === "") {
      const { items, nextIndex } = parseYamlStringList(lines, i + 1);
      result[key] = items;
      i = nextIndex;
      continue;
    }

    if (rest === "" || rest === "|" || rest === ">") {
      result[key] = rest === "" ? "" : rest;
    } else if (rest === "true" || rest === "false") {
      result[key] = rest === "true";
    } else if (/^-?\d+$/.test(rest)) {
      result[key] = Number(rest);
    } else {
      result[key] = unquoteYamlScalar(rest);
    }
    i += 1;
  }

  return result;
}

export function splitFlowDocument(content: string): { frontmatter: string; body: string } | null {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(normalized);
  if (!match) return null;
  return { frontmatter: match[1]!.trim(), body: match[2]!.trim() };
}

export function parseFlowDocument(
  content: string,
  fileName: string,
  filePath: string,
): FlowDefinition | { error: string } {
  const split = splitFlowDocument(content);
  if (!split) {
    return { error: "Missing YAML frontmatter (--- ... ---)" };
  }

  const fm = parseSimpleFrontmatter(split.frontmatter);
  const id = typeof fm.id === "string" ? fm.id.trim() : "";
  if (!id) {
    return { error: "Frontmatter field 'id' is required" };
  }

  let phases = parsePhasesFromFrontmatter(fm.phases);
  if (phases.length === 0) {
    phases = extractPhaseIdsFromBody(split.body).map((phaseId) => ({
      id: phaseId,
      label: slugLabel(phaseId),
    }));
  }

  const enabled = fm.enabled !== false;
  const timeoutSec =
    typeof fm.timeout_sec === "number" && fm.timeout_sec > 0 ? fm.timeout_sec : 600;
  const onFail = fm.on_fail === "slack" ? "slack" : "none";
  const onSuccess = fm.on_success === "slack" ? "slack" : "none";
  const notify = parseDesktopNotify(fm.notify);
  const webhooks = parseWebhooks(fm.webhooks);
  if (webhooks && "error" in webhooks) return webhooks;
  let env: Record<string, string> | undefined;
  if (fm.env && typeof fm.env === "object" && !Array.isArray(fm.env)) {
    const entries = Object.entries(fm.env as Record<string, string>);
    for (const [key] of entries) {
      if (!isValidFlowEnvKey(key)) {
        return { error: `Frontmatter 'env' has an invalid variable name: ${key}` };
      }
    }
    if (entries.length > 0) env = Object.fromEntries(entries);
  }
  const runner = fm.runner === "http" ? "http" : "claude";
  const orchestration = fm.orchestration === true ? true : undefined;
  const agentTool =
    typeof fm.tool === "string" && fm.tool.trim() ? fm.tool.trim() : "claude";
  const profileInheritsTool = !(typeof fm.tool === "string" && fm.tool.trim());
  const toolArgs =
    typeof fm.tool_args === "string" && fm.tool_args.trim() ? fm.tool_args.trim() : undefined;
  const cwd = typeof fm.cwd === "string" && fm.cwd.trim() ? fm.cwd.trim() : undefined;
  const profileId =
    typeof fm.profile === "string" && fm.profile.trim() ? fm.profile.trim() : undefined;
  const extraMcpServers = parseStringListField(fm.extra_mcp_servers);
  const agentAllowedTools = parseStringListField(fm.allowed_tools);
  const httpUrl = typeof fm.url === "string" ? fm.url.trim() : undefined;
  let httpMethod: "GET" | "HEAD";
  if (runner === "http") {
    const httpMethodParsed = parseHttpMethod(fm.method);
    if (typeof httpMethodParsed === "object") {
      return httpMethodParsed;
    }
    httpMethod = httpMethodParsed;
    if (!httpUrl) {
      return { error: "HTTP runner requires frontmatter field 'url'" };
    }
    if (!isValidHttpFlowUrl(httpUrl)) {
      return { error: "Frontmatter field 'url' must be an absolute http or https URL" };
    }
  } else {
    httpMethod = fm.method === "GET" ? "GET" : "HEAD";
  }

  return {
    schema: FLOW_DEFINITION_SCHEMA,
    id,
    fileName,
    filePath,
    enabled,
    runner,
    orchestration,
    httpUrl,
    httpMethod,
    schedule: typeof fm.schedule === "string" ? fm.schedule : undefined,
    timezone: typeof fm.timezone === "string" ? fm.timezone : undefined,
    timeoutSec,
    outputTemplate: typeof fm.output === "string" ? fm.output : undefined,
    onFail,
    onSuccess,
    notify,
    webhooks,
    historyMaxRuns: parsePositiveInt(fm.history_max_runs, 100_000),
    historyMaxDays: parsePositiveInt(fm.history_max_days, 36_500),
    maxParallel: parsePositiveInt(fm.max_parallel, 16),
    agentTool,
    profileInheritsTool,
    toolArgs,
    cwd,
    profileId,
    env,
    extraMcpServers,
    agentAllowedTools,
    phases,
    body: split.body,
  };
}
