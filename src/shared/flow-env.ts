/** Expand `${VAR}` references from `source` (unknown variables expand to ""). */
export function expandEnvPlaceholders(
  value: string,
  source: Record<string, string | undefined>,
): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => source[name] ?? "");
}

export type FlowProfileEnvBinding = {
  id: string;
  name: string;
};

/**
 * Environment the runner adds on top of `process.env` for an agent process:
 * flow/phase `env:` values (with `${VAR}` expansion against the base env) plus
 * `AISHELF_PROFILE_ID` / `AISHELF_PROFILE_NAME` when a Terminal profile is bound.
 */
export function buildFlowRunnerEnv(options: {
  flowEnv?: Record<string, string>;
  profile?: FlowProfileEnvBinding | null;
  baseEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const base = options.baseEnv ?? {};
  const out: Record<string, string> = {};
  if (options.profile) {
    out.AISHELF_PROFILE_ID = options.profile.id;
    out.AISHELF_PROFILE_NAME = options.profile.name;
  }
  for (const [key, raw] of Object.entries(options.flowEnv ?? {})) {
    out[key] = expandEnvPlaceholders(raw, { ...base, ...out });
  }
  return out;
}

/** `KEY=value` lines ↔ env map (renderer editor). Blank lines and `#` comments are ignored. */
export function parseEnvLines(text: string): { env: Record<string, string> } | { error: string } {
  const env: Record<string, string> = {};
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) return { error: `Line ${index + 1}: expected KEY=value` };
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { error: `Line ${index + 1}: invalid variable name "${key}"` };
    }
    env[key] = line.slice(eq + 1).trim();
  }
  return { env };
}

export function formatEnvLines(env: Record<string, string> | undefined): string {
  return Object.entries(env ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
