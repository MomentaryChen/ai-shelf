import {
  FLOW_DEFINITION_SCHEMA,
  type FlowDefinition,
  type FlowPhaseDef,
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
    phases.push({ id, label });
  }
  return phases;
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
      const phases: { id: string; label?: string }[] = [];
      i += 1;
      while (i < lines.length) {
        const phaseLine = lines[i]!;
        if (!phaseLine.startsWith("  ")) break;
        const idMatch = /^\s+-\s+id:\s*(.+)$/.exec(phaseLine);
        if (idMatch) {
          const phase: { id: string; label?: string } = { id: idMatch[1]!.trim().replace(/^["']|["']$/g, "") };
          if (i + 1 < lines.length) {
            const labelMatch = /^\s+label:\s*(.+)$/.exec(lines[i + 1]!);
            if (labelMatch) {
              phase.label = labelMatch[1]!.trim().replace(/^["']|["']$/g, "");
              i += 1;
            }
          }
          phases.push(phase);
        }
        i += 1;
      }
      result.phases = phases;
      continue;
    }

    if (rest === "" || rest === "|" || rest === ">") {
      result[key] = rest === "" ? "" : rest;
    } else if (rest === "true" || rest === "false") {
      result[key] = rest === "true";
    } else if (/^-?\d+$/.test(rest)) {
      result[key] = Number(rest);
    } else {
      result[key] = rest.replace(/^["']|["']$/g, "");
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
  const httpUrl = typeof fm.url === "string" ? fm.url.trim() : undefined;
  const httpMethod = fm.method === "GET" ? "GET" : "HEAD";

  return {
    schema: FLOW_DEFINITION_SCHEMA,
    id,
    fileName,
    filePath,
    enabled,
    runner,
    httpUrl,
    httpMethod,
    schedule: typeof fm.schedule === "string" ? fm.schedule : undefined,
    timezone: typeof fm.timezone === "string" ? fm.timezone : undefined,
    timeoutSec,
    outputTemplate: typeof fm.output === "string" ? fm.output : undefined,
    onFail,
    phases,
    body: split.body,
  };
}
