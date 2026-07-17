/**
 * Shared PTY shell spawn helpers for Electron main and CLI PtyRuntime.
 * Keeps Windows/Unix candidate args, preference ordering, and env in one place.
 */

export type PtyShellPreference =
  | "auto"
  | "pwsh"
  | "powershell"
  | "cmd"
  | "bash"
  | "zsh"
  | "fish"
  | "sh";

export type UnixShellFamily = "bash" | "zsh" | "fish" | "sh";
export type WindowsShellFamily = "pwsh" | "powershell" | "cmd";

export type PtyShellCandidate = readonly [file: string, args: string[]];

export const PTY_SHELL_PREFERENCE_VALUES = [
  "auto",
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "zsh",
  "fish",
  "sh",
] as const;

/** Default preference: platform-aware cascade ($SHELL on Unix, pwsh-first on Windows). */
export const DEFAULT_PTY_SHELL: PtyShellPreference = "auto";

export const NO_SUITABLE_WINDOWS_SHELL_ERROR =
  "No suitable shell found (pwsh / powershell / cmd)";

export const NO_SUITABLE_UNIX_SHELL_ERROR =
  "No suitable shell found ($SHELL / bash / zsh / fish / sh)";

/** Windows shell miss (kept for existing imports). */
export const NO_SUITABLE_SHELL_ERROR = NO_SUITABLE_WINDOWS_SHELL_ERROR;

/** Default WT_SESSION when the host env does not already set one. */
export const DEFAULT_PTY_WT_SESSION = "ai-shelf";

const UNIX_FAMILIES: readonly UnixShellFamily[] = ["bash", "zsh", "fish", "sh"];
const UNIX_FAMILY_SET = new Set<string>(UNIX_FAMILIES);
const WINDOWS_FAMILY_SET = new Set<string>(["pwsh", "powershell", "cmd"]);

export function shellBasename(shellPath: string): string {
  const base = shellPath.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.toLowerCase().replace(/\.exe$/i, "");
}

export function isUnixShellFamily(value: string): value is UnixShellFamily {
  return UNIX_FAMILY_SET.has(value);
}

export function isWindowsShellFamily(value: string): value is WindowsShellFamily {
  return WINDOWS_FAMILY_SET.has(value);
}

/**
 * Normalize a stored/CLI preference.
 * Unknown values become `auto`. Cross-platform ids are kept so callers can
 * map them away with {@link effectiveWindowsShellPref} / {@link effectiveUnixShellPref}.
 */
export function normalizePtyShellPreference(shell?: string): PtyShellPreference {
  switch (shell) {
    case "auto":
    case "powershell":
    case "cmd":
    case "pwsh":
    case "bash":
    case "zsh":
    case "fish":
    case "sh":
      return shell;
    default:
      return DEFAULT_PTY_SHELL;
  }
}

/** Windows-relevant preference; Unix ids → auto (pwsh-first cascade). */
export function effectiveWindowsShellPref(shell?: string): "auto" | WindowsShellFamily {
  const pref = normalizePtyShellPreference(shell);
  if (isWindowsShellFamily(pref)) return pref;
  return "auto";
}

/** Unix-relevant preference; Windows ids → auto ($SHELL cascade). */
export function effectiveUnixShellPref(shell?: string): "auto" | UnixShellFamily {
  const pref = normalizePtyShellPreference(shell);
  if (isUnixShellFamily(pref)) return pref;
  return "auto";
}

/**
 * Map desktop "external terminal" preference onto an embedded PTY shell order.
 * `auto` / `wt` keep the default platform cascade.
 */
export function ptyShellFromExternalTerminal(terminal?: string): PtyShellPreference {
  switch (terminal) {
    case "powershell":
    case "cmd":
    case "pwsh":
      return terminal;
    default:
      return DEFAULT_PTY_SHELL;
  }
}

function windowsArgsForShell(shell: string, command: string): string[] {
  const interactive = command === "";
  if (shell === "cmd.exe") {
    return interactive ? ["/k"] : ["/k", command];
  }
  return interactive
    ? ["-NoLogo", "-NoExit"]
    : ["-NoLogo", "-NoExit", "-Command", command];
}

/** Build the default Windows shell cascade (pwsh → powershell → cmd). */
export function buildWindowsPtyCandidates(command: string): PtyShellCandidate[] {
  return [
    ["pwsh.exe", windowsArgsForShell("pwsh.exe", command)],
    ["powershell.exe", windowsArgsForShell("powershell.exe", command)],
    ["cmd.exe", windowsArgsForShell("cmd.exe", command)],
  ];
}

/**
 * Reorder the default Windows cascade so the preferred shell is tried first,
 * with the remaining shells as fallbacks.
 */
export function orderWindowsPtyCandidates(
  candidates: readonly PtyShellCandidate[],
  shellPref?: string,
): PtyShellCandidate[] {
  const pref = effectiveWindowsShellPref(shellPref);
  if (pref === "cmd") {
    return [...candidates].reverse();
  }
  if (pref === "powershell") {
    const pwsh = candidates[0];
    const powershell = candidates[1];
    const cmd = candidates[2];
    if (!pwsh || !powershell || !cmd) return [...candidates];
    return [powershell, pwsh, cmd];
  }
  // auto / pwsh → default order
  return [...candidates];
}

function pathsForUnixFamily(family: UnixShellFamily): string[] {
  switch (family) {
    case "bash":
      return ["bash", "/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"];
    case "zsh":
      return ["zsh", "/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"];
    case "fish":
      return ["fish", "/usr/bin/fish", "/usr/local/bin/fish", "/opt/homebrew/bin/fish"];
    case "sh":
      return ["sh", "/bin/sh", "/usr/bin/sh"];
  }
}

function orderUnixFamilies(
  preferred: "auto" | UnixShellFamily,
  envBase: string,
): UnixShellFamily[] {
  if (preferred !== "auto") {
    return [preferred, ...UNIX_FAMILIES.filter((f) => f !== preferred)];
  }
  if (isUnixShellFamily(envBase)) {
    return [envBase, ...UNIX_FAMILIES.filter((f) => f !== envBase)];
  }
  return [...UNIX_FAMILIES];
}

function posixSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function unixShellArgs(shellPath: string, command: string): string[] {
  if (!command) return [];
  return ["-c", `${command}; exec ${posixSingleQuote(shellPath)}`];
}

/**
 * Ordered Unix shell commands/paths to try (spawn + catch next).
 * - auto: $SHELL first when set, then bash → zsh → fish → sh
 * - bash|zsh|fish|sh: that family first, then the rest
 */
export function buildUnixPtyCandidates(
  command: string,
  shellPref?: string,
  envShell: string | undefined = process.env.SHELL,
): PtyShellCandidate[] {
  const preferred = effectiveUnixShellPref(shellPref);
  const env = envShell?.trim() ?? "";
  const envBase = env ? shellBasename(env) : "";
  const families = orderUnixFamilies(preferred, envBase);

  const files: string[] = [];
  const seen = new Set<string>();
  const add = (p: string | undefined) => {
    const t = p?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    files.push(t);
  };

  if (env && (preferred === "auto" || envBase === preferred)) {
    add(env);
  }

  for (const family of families) {
    if (env && envBase === family) add(env);
    for (const p of pathsForUnixFamily(family)) add(p);
  }

  return files.map((file) => [file, unixShellArgs(file, command)] as const);
}

/** @deprecated Prefer {@link buildUnixPtyCandidates}; kept for callers that want a single target. */
export function buildUnixPtySpawn(
  command: string,
  shellPref?: string,
  envShell?: string,
): { file: string; args: string[] } {
  const [first] = buildUnixPtyCandidates(command, shellPref, envShell);
  return first ? { file: first[0], args: [...first[1]] } : { file: "/bin/bash", args: [] };
}

export function buildPtyEnv(options?: {
  env?: NodeJS.ProcessEnv;
  wtSessionFallback?: string;
}): Record<string, string> {
  const env = options?.env ?? process.env;
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") merged[key] = value;
  }
  merged.COLORTERM = "truecolor";
  merged.TERM_PROGRAM = "vscode";
  merged.WT_SESSION =
    env.WT_SESSION ?? options?.wtSessionFallback ?? DEFAULT_PTY_WT_SESSION;
  return merged;
}

export interface ResolvedPtySpawnPlan {
  platform: "win32" | "unix";
  /** Ordered Windows candidates when platform is win32. */
  windowsCandidates: PtyShellCandidate[];
  /** Ordered Unix candidates when platform is unix. */
  unixCandidates: PtyShellCandidate[];
  /** First Unix candidate (compat for older call sites). */
  unix: { file: string; args: string[] };
  env: Record<string, string>;
}

export function resolvePtySpawnPlan(options: {
  command: string;
  shell?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  wtSessionFallback?: string;
}): ResolvedPtySpawnPlan {
  const platform = options.platform ?? process.platform;
  const env = buildPtyEnv({
    env: options.env,
    wtSessionFallback: options.wtSessionFallback,
  });
  const unixCandidates = buildUnixPtyCandidates(
    options.command,
    options.shell,
    options.env?.SHELL ?? process.env.SHELL,
  );
  const unixFirst = unixCandidates[0];
  const unix = unixFirst
    ? { file: unixFirst[0], args: [...unixFirst[1]] }
    : { file: "/bin/bash", args: [] };

  if (platform === "win32") {
    return {
      platform: "win32",
      windowsCandidates: orderWindowsPtyCandidates(
        buildWindowsPtyCandidates(options.command),
        options.shell,
      ),
      unixCandidates,
      unix,
      env,
    };
  }
  return {
    platform: "unix",
    windowsCandidates: [],
    unixCandidates,
    unix,
    env,
  };
}
