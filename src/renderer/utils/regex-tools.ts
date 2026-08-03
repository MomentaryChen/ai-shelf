/** Pure regex helpers for the Tools → Regex panel. */

export type RegexFlag = "g" | "i" | "m" | "s" | "u";

export type RegexFlags = Partial<Record<RegexFlag, boolean>>;

export type RegexMatch = {
  index: number;
  match: string;
  groups: string[];
  namedGroups: Record<string, string>;
};

export type RegexTestResult =
  | { ok: true; matches: RegexMatch[]; flags: string; truncated: boolean }
  | { ok: false; error: "empty" | "invalid" };

export type RegexReplaceResult =
  | { ok: true; result: string; count: number; flags: string }
  | { ok: false; error: "empty" | "invalid" };

export type RegexBuiltinPresetId =
  | "email"
  | "url"
  | "ipv4"
  | "uuid"
  | "hexColor"
  | "whitespace"
  | "quoted"
  | "digits";

export type RegexPreset = {
  id: string;
  name: string;
  pattern: string;
  flags: string;
  replacement?: string;
  sample?: string;
  builtin?: boolean;
};

export const REGEX_FLAG_ORDER: RegexFlag[] = ["g", "i", "m", "s", "u"];

export const MAX_REGEX_MATCHES = 500;

export const REGEX_PRESETS_STORAGE_KEY = "aishelf-regex-presets";

export const REGEX_BUILTIN_PRESETS: RegexPreset[] = [
  {
    id: "email",
    name: "email",
    pattern: "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+",
    flags: "gi",
    sample: "Reach us at hello@example.com or support@ai-shelf.dev.",
    builtin: true,
  },
  {
    id: "url",
    name: "url",
    pattern: "https?:\\/\\/[^\\s\"'<>]+",
    flags: "gi",
    sample: "Docs: https://example.com/path?q=1 and http://localhost:5173",
    builtin: true,
  },
  {
    id: "ipv4",
    name: "ipv4",
    pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b",
    flags: "g",
    sample: "Gateway 192.168.1.1 · DNS 8.8.8.8 · bad 999.1.1.1",
    builtin: true,
  },
  {
    id: "uuid",
    name: "uuid",
    pattern: "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
    flags: "gi",
    sample: "id=550e8400-e29b-41d4-a716-446655440000",
    builtin: true,
  },
  {
    id: "hexColor",
    name: "hexColor",
    pattern: "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b",
    flags: "g",
    sample: "Primary #C97B5A · short #FBF · with alpha #C97B5ACC",
    builtin: true,
  },
  {
    id: "whitespace",
    name: "whitespace",
    pattern: "[ \\t]+",
    flags: "g",
    replacement: " ",
    sample: "too   many\tspaces   here",
    builtin: true,
  },
  {
    id: "quoted",
    name: "quoted",
    pattern: "\"([^\"]*)\"|'([^']*)'",
    flags: "g",
    sample: `Say "hello" or 'world' in quotes.`,
    builtin: true,
  },
  {
    id: "digits",
    name: "digits",
    pattern: "\\b(?<num>\\d+(?:\\.\\d+)?)\\b",
    flags: "g",
    sample: "Counts: 12 items, 3.5 kg, and version 2.",
    builtin: true,
  },
];

const FLAG_SET = new Set<string>(REGEX_FLAG_ORDER);

export function flagsToString(flags: RegexFlags): string {
  return REGEX_FLAG_ORDER.filter((f) => flags[f]).join("");
}

export function parseFlags(flags: string): RegexFlags {
  const out: RegexFlags = {};
  for (const ch of flags) {
    if (FLAG_SET.has(ch)) out[ch as RegexFlag] = true;
  }
  return out;
}

export function isValidSearchRegex(pattern: string, flags = ""): boolean {
  if (!pattern) return false;
  try {
    // eslint-disable-next-line no-new -- validate only
    new RegExp(pattern, sanitizeFlags(flags));
    return true;
  } catch {
    return false;
  }
}

function sanitizeFlags(flags: string): string {
  const seen = new Set<string>();
  let out = "";
  for (const ch of flags) {
    if (!FLAG_SET.has(ch) || seen.has(ch)) continue;
    seen.add(ch);
    out += ch;
  }
  return out;
}

export function compileRegex(pattern: string, flags: string): RegExp {
  return new RegExp(pattern, sanitizeFlags(flags));
}

function toMatch(m: RegExpExecArray): RegexMatch {
  const groups: string[] = [];
  for (let i = 1; i < m.length; i++) {
    groups.push(m[i] ?? "");
  }
  const namedGroups: Record<string, string> = {};
  if (m.groups) {
    for (const [k, v] of Object.entries(m.groups)) {
      if (v !== undefined) namedGroups[k] = v;
    }
  }
  return {
    index: m.index,
    match: m[0] ?? "",
    groups,
    namedGroups,
  };
}

export function testRegex(
  pattern: string,
  flags: string,
  input: string,
  maxMatches = MAX_REGEX_MATCHES,
): RegexTestResult {
  const trimmed = pattern;
  if (!trimmed) return { ok: false, error: "empty" };

  const safeFlags = sanitizeFlags(flags);
  // Always search with g so we can collect all matches; remember if caller asked for g.
  const hadG = safeFlags.includes("g");
  const execFlags = hadG ? safeFlags : `${safeFlags}g`;

  let re: RegExp;
  try {
    re = compileRegex(trimmed, execFlags);
  } catch {
    return { ok: false, error: "invalid" };
  }

  const matches: RegexMatch[] = [];
  let truncated = false;
  let m: RegExpExecArray | null;
  // Guard against zero-width infinite loops.
  let lastIndex = -1;
  while ((m = re.exec(input)) !== null) {
    matches.push(toMatch(m));
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    if (m[0] === "") {
      re.lastIndex = m.index + 1;
    }
    if (re.lastIndex === lastIndex) break;
    lastIndex = re.lastIndex;
    if (!hadG) break;
  }

  return { ok: true, matches, flags: safeFlags, truncated };
}

export function replaceRegex(
  pattern: string,
  flags: string,
  input: string,
  replacement: string,
): RegexReplaceResult {
  if (!pattern) return { ok: false, error: "empty" };

  const safeFlags = sanitizeFlags(flags);
  let re: RegExp;
  try {
    re = compileRegex(pattern, safeFlags);
  } catch {
    return { ok: false, error: "invalid" };
  }

  const countResult = testRegex(pattern, safeFlags, input);
  const count = countResult.ok ? countResult.matches.length : 0;

  try {
    const result = input.replace(re, replacement);
    return { ok: true, result, count, flags: safeFlags };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export function createUserPreset(input: {
  name: string;
  pattern: string;
  flags: string;
  replacement?: string;
  sample?: string;
}): RegexPreset | null {
  const name = input.name.trim();
  const pattern = input.pattern;
  if (!name || !pattern) return null;
  if (!isValidSearchRegex(pattern, input.flags)) return null;
  return {
    id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    pattern,
    flags: sanitizeFlags(input.flags),
    replacement: input.replacement,
    sample: input.sample,
    builtin: false,
  };
}

/** Load user-saved presets from localStorage (browser only). */
export function loadSavedPresets(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): RegexPreset[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(REGEX_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is RegexPreset => {
        if (!p || typeof p !== "object") return false;
        const o = p as Record<string, unknown>;
        return (
          typeof o.id === "string" &&
          typeof o.name === "string" &&
          typeof o.pattern === "string" &&
          typeof o.flags === "string"
        );
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        pattern: p.pattern,
        flags: sanitizeFlags(p.flags),
        replacement: typeof p.replacement === "string" ? p.replacement : undefined,
        sample: typeof p.sample === "string" ? p.sample : undefined,
        builtin: false,
      }));
  } catch {
    return [];
  }
}

export function saveSavedPresets(
  presets: RegexPreset[],
  storage: Pick<Storage, "setItem"> | null | undefined = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): void {
  if (!storage) return;
  const userOnly = presets
    .filter((p) => !p.builtin)
    .map((p) => ({
      id: p.id,
      name: p.name,
      pattern: p.pattern,
      flags: sanitizeFlags(p.flags),
      replacement: p.replacement,
      sample: p.sample,
    }));
  storage.setItem(REGEX_PRESETS_STORAGE_KEY, JSON.stringify(userOnly));
}
