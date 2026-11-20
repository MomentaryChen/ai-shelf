/**
 * Task prompt variables: `{{name}}` placeholders filled in a form each time the task runs.
 *
 * Names are identifiers (`[A-Za-z_][A-Za-z0-9_-]*`, at most 40 chars) so text like
 * `${{ secrets.TOKEN }}` or `{{ .Values.x }}` in a prompt is left alone. Filling is a
 * single pass: a value that itself contains `{{x}}` is inserted as-is, never expanded.
 */

const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]{0,39})\s*\}\}/g;

/** Variables the run form pre-fills: the git branch, the clipboard, a picked file. */
export const BUILTIN_TASK_VARIABLES = ["branch", "selection", "file"] as const;
export type BuiltinTaskVariable = (typeof BUILTIN_TASK_VARIABLES)[number];

export function isBuiltinTaskVariable(name: string): name is BuiltinTaskVariable {
  return (BUILTIN_TASK_VARIABLES as readonly string[]).includes(name.toLowerCase());
}

/** Variable names in order of first appearance, deduplicated case-insensitively. */
export function extractTaskVariables(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of prompt.matchAll(VARIABLE_RE)) {
    const name = match[1]!;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Replace each `{{name}}` with its value (names match case-insensitively). A name with no
 * entry in `values` is left in place, so a missing field is visible in the sent prompt.
 */
export function fillTaskVariables(
  prompt: string,
  values: Readonly<Record<string, string>>,
): string {
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) lookup.set(k.toLowerCase(), v);
  return prompt.replace(VARIABLE_RE, (whole, name: string) => {
    const value = lookup.get(name.toLowerCase());
    return value === undefined ? whole : value;
  });
}

/** Names whose value is empty after trimming. */
export function missingTaskVariables(
  names: readonly string[],
  values: Readonly<Record<string, string>>,
): string[] {
  return names.filter((n) => !(values[n] ?? "").trim());
}
