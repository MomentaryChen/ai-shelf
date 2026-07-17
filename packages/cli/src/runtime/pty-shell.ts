/**
 * Shared PTY shell spawn helpers for Electron main and CLI PtyRuntime.
 * Keeps Windows candidate args, preference ordering, and env in one place.
 */

export type PtyShellPreference = "pwsh" | "powershell" | "cmd" | "bash";

export type PtyShellCandidate = readonly [file: string, args: string[]];

export const DEFAULT_PTY_SHELL: PtyShellPreference = "pwsh";

export const NO_SUITABLE_SHELL_ERROR =
  "No suitable shell found (pwsh / powershell / cmd)";

/** Default WT_SESSION when the host env does not already set one. */
export const DEFAULT_PTY_WT_SESSION = "ai-shelf";

export function normalizePtyShellPreference(shell?: string): PtyShellPreference {
  switch (shell) {
    case "powershell":
    case "cmd":
    case "bash":
      return shell;
    case "pwsh":
    default:
      return "pwsh";
  }
}

/**
 * Map desktop "external terminal" preference onto an embedded PTY shell order.
 * `auto` / `wt` keep the default pwsh → powershell → cmd cascade.
 */
export function ptyShellFromExternalTerminal(
  terminal?: string,
): PtyShellPreference {
  switch (terminal) {
    case "powershell":
    case "cmd":
    case "pwsh":
      return terminal;
    default:
      return DEFAULT_PTY_SHELL;
  }
}

export function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function bashSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function windowsArgsForShell(
  shell: string,
  command: string,
  pwshIntegrationCommand?: string,
): string[] {
  const interactive = command === "";
  if (shell === "cmd.exe") {
    return interactive ? ["/k"] : ["/k", command];
  }
  const inject = pwshIntegrationCommand?.trim() || "";
  if (interactive) {
    return inject
      ? ["-NoLogo", "-NoExit", "-Command", inject]
      : ["-NoLogo", "-NoExit"];
  }
  return [
    "-NoLogo",
    "-NoExit",
    "-Command",
    inject ? `${inject}; ${command}` : command,
  ];
}

/** Build the default Windows shell cascade (pwsh → powershell → cmd). */
export function buildWindowsPtyCandidates(
  command: string,
  pwshIntegrationCommand?: string,
): PtyShellCandidate[] {
  return [
    ["pwsh.exe", windowsArgsForShell("pwsh.exe", command, pwshIntegrationCommand)],
    [
      "powershell.exe",
      windowsArgsForShell("powershell.exe", command, pwshIntegrationCommand),
    ],
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
  const pref = normalizePtyShellPreference(shellPref);
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
  // pwsh / bash → default order
  return [...candidates];
}

export function buildUnixPtySpawn(
  command: string,
  bashInitFile?: string,
): {
  file: string;
  args: string[];
} {
  const init = bashInitFile?.trim() || "";
  if (!init) {
    return {
      file: "/bin/bash",
      args: command === "" ? [] : ["-c", `${command}; exec bash`],
    };
  }
  if (command === "") {
    return { file: "/bin/bash", args: ["--init-file", init] };
  }
  const quoted = bashSingleQuote(init);
  return {
    file: "/bin/bash",
    args: [
      "-c",
      `source ${quoted}; ${command}; exec bash --init-file ${quoted}`,
    ],
  };
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
  /** Unix spawn target when platform is unix. */
  unix: { file: string; args: string[] };
  env: Record<string, string>;
}

export function resolvePtySpawnPlan(options: {
  command: string;
  shell?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  wtSessionFallback?: string;
  /**
   * Optional OSC 7 hooks: pwsh/powershell dot-source command, bash init-file path.
   * cmd.exe is left unchanged.
   */
  shellIntegration?: {
    pwshCommand?: string;
    bashInitFile?: string;
  };
}): ResolvedPtySpawnPlan {
  const platform = options.platform ?? process.platform;
  const env = buildPtyEnv({
    env: options.env,
    wtSessionFallback: options.wtSessionFallback,
  });
  const pwshCommand = options.shellIntegration?.pwshCommand;
  const bashInitFile = options.shellIntegration?.bashInitFile;
  if (platform === "win32") {
    return {
      platform: "win32",
      windowsCandidates: orderWindowsPtyCandidates(
        buildWindowsPtyCandidates(options.command, pwshCommand),
        options.shell,
      ),
      unix: buildUnixPtySpawn(options.command, bashInitFile),
      env,
    };
  }
  return {
    platform: "unix",
    windowsCandidates: [],
    unix: buildUnixPtySpawn(options.command, bashInitFile),
    env,
  };
}
