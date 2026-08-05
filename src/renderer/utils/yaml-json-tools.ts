/** Pure YAML ↔ JSON helpers for the Tools → YAML panel. */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { sortKeysDeep, type JsonIndent } from "./json-tools";

export type YamlJsonDirection = "yaml-to-json" | "json-to-yaml";

export type YamlJsonJsonMode = "pretty" | "minify";

export type YamlJsonTransformOptions = {
  direction: YamlJsonDirection;
  /** Used when emitting pretty JSON or YAML. Defaults to 2. */
  indent?: JsonIndent;
  /** Recursively sort object keys before emit. */
  sortKeys?: boolean;
  /** Used when direction is `yaml-to-json`. Defaults to pretty. */
  jsonMode?: YamlJsonJsonMode;
};

export type YamlJsonTransformResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Convert between YAML and JSON text for dense config-file workflows.
 * Empty / whitespace-only input returns `{ ok: false, reason: "empty" }`.
 */
export function transformYamlJson(
  input: string,
  options: YamlJsonTransformOptions,
): YamlJsonTransformResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const indent = options.indent ?? 2;
  const sortKeys = options.sortKeys === true;

  if (options.direction === "yaml-to-json") {
    let parsed: unknown;
    try {
      parsed = parseYaml(trimmed);
    } catch {
      return { ok: false, reason: "invalid" };
    }
    // Empty YAML doc (`---` / blank) parses to `undefined`.
    if (parsed === undefined) return { ok: false, reason: "empty" };

    const jsonMode = options.jsonMode ?? "pretty";
    const space = jsonMode === "pretty" ? indent : undefined;
    try {
      // Normalize YAML-only values (Date, etc.) to JSON-safe forms before
      // optional key sorting — sortKeysDeep treats Date as a plain object.
      let value: unknown = JSON.parse(JSON.stringify(parsed));
      if (sortKeys) value = sortKeysDeep(value);
      return { ok: true, text: JSON.stringify(value, null, space) };
    } catch {
      return { ok: false, reason: "invalid" };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const value = sortKeys ? sortKeysDeep(parsed) : parsed;
  try {
    return {
      ok: true,
      text: stringifyYaml(value, { indent }).trimEnd(),
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
