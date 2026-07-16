import {
  FLOW_DEFINITION_SCHEMA,
  type FlowDefinition,
  type FlowPhaseBranch,
  type FlowPhaseDef,
  type FlowPhaseKind,
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
  return phase;
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

    if (key === "phases" && rest === "") {
      const phases: Record<string, unknown>[] = [];
      i += 1;
      let current: Record<string, unknown> | null = null;
      while (i < lines.length) {
        const phaseLine = lines[i]!;
        if (!phaseLine.startsWith("  ")) break;
        const idMatch = /^\s+-\s+id:\s*(.+)$/.exec(phaseLine);
        if (idMatch) {
          if (current) phases.push(current);
          current = { id: unquoteYamlScalar(idMatch[1]!.trim()) };
          i += 1;
          continue;
        }
        if (current) {
          const fieldMatch = /^\s+([a-zA-Z0-9_]+):\s*(.*)$/.exec(phaseLine);
          if (fieldMatch) {
            const fieldKey = fieldMatch[1]!;
            const fieldRest = fieldMatch[2]!.trim();
            if (fieldRest === "true" || fieldRest === "false") {
              current[fieldKey] = fieldRest === "true";
            } else if (/^-?\d+$/.test(fieldRest)) {
              current[fieldKey] = Number(fieldRest);
            } else if (fieldRest !== "") {
              current[fieldKey] = unquoteYamlScalar(fieldRest);
            }
          }
        }
        i += 1;
      }
      if (current) phases.push(current);
      result.phases = phases;
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
    agentTool,
    profileInheritsTool,
    toolArgs,
    cwd,
    profileId,
    extraMcpServers,
    agentAllowedTools,
    phases,
    body: split.body,
  };
}
