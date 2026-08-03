/** Pure JSON helpers for the Tools → JSON panel. */

export type JsonIndent = 2 | 4;

export type JsonMode = "pretty" | "minify";

export type JsonTransformOptions = {
  mode: JsonMode;
  /** Used when mode is `pretty`. Defaults to 2. */
  indent?: JsonIndent;
  /** Recursively sort object keys before stringify. */
  sortKeys?: boolean;
};

export type JsonTransformResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "invalid" };

/** Recursively sort object keys (arrays keep order). */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Parse JSON text and re-emit as pretty or minified JSON.
 * Empty / whitespace-only input returns `{ ok: false, reason: "empty" }`.
 */
export function transformJson(
  input: string,
  options: JsonTransformOptions,
): JsonTransformResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const value = options.sortKeys ? sortKeysDeep(parsed) : parsed;
  const space = options.mode === "pretty" ? (options.indent ?? 2) : undefined;
  return { ok: true, text: JSON.stringify(value, null, space) };
}
