/**
 * SSH remote profiles: validation, `ssh` argv building and client discovery.
 *
 * Profiles sync through the cloud, so a remote config is untrusted input that
 * ends up as `ssh` arguments on this machine. Only structured fields are
 * accepted (host / user / port / jump / cwd) and each is checked against a
 * strict charset — no free-form ssh options, no `ProxyCommand`, no secrets.
 * Keys, agents and per-host options belong in the user's `~/.ssh/config`.
 */
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface RemoteSshConfig {
  kind: "ssh";
  /** Hostname, IP, or a `Host` alias from ~/.ssh/config. */
  host: string;
  user?: string;
  port?: number;
  /** ProxyJump: `[user@]host[:port]`, comma-separated for multiple hops. */
  jump?: string;
  /** Remote start directory; empty = remote login directory. `~` / `~/…` allowed. */
  cwd?: string;
  /**
   * Local private key (`ssh -i`). Only the path is stored, never key material;
   * ssh also loads `<key>-cert.pub` next to it for certificate login. A path
   * missing on this machine just falls back to agent / ~/.ssh/config keys.
   */
  identityFile?: string;
}

export const SSH_CLIENT_NOT_FOUND_ERROR = "SSH client not found";

const HOST_RE = /^[A-Za-z0-9_][A-Za-z0-9._:-]{0,252}$/u;
const USER_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/u;
const JUMP_HOP_RE =
  /^(?:[A-Za-z0-9_][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9_][A-Za-z0-9._-]{0,252}(?::\d{1,5})?$/u;
const MAX_JUMP_HOPS = 4;
const MAX_REMOTE_CWD = 1024;
const MAX_IDENTITY_PATH = 1024;
/** Seconds before an unreachable host / gateway fails instead of hanging. */
export const SSH_CONNECT_TIMEOUT_SECONDS = 10;

export function isValidSshHost(value: string): boolean {
  return HOST_RE.test(value);
}

export function isValidSshUser(value: string): boolean {
  return USER_RE.test(value);
}

export function isValidSshPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function isValidSshJump(value: string): boolean {
  const hops = value.split(",");
  if (hops.length === 0 || hops.length > MAX_JUMP_HOPS) return false;
  return hops.every((hop) => {
    if (!JUMP_HOP_RE.test(hop)) return false;
    const port = hop.match(/:(\d+)$/u)?.[1];
    return port === undefined || isValidSshPort(Number(port));
  });
}

export function isValidRemoteCwd(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return value.length <= MAX_REMOTE_CWD && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function isValidIdentityFile(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_IDENTITY_PATH &&
    !value.startsWith("-") &&
    // ssh stat()s the literal -i path, then %-expands it: a `%` can never work
    // (escaping as %% fails the stat, raw % is mis-expanded), so reject it.
    !value.includes("%") &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

/**
 * Normalize untrusted input (IPC, sync bundle, DB row) into a config, or `null`
 * when it is absent or any field is invalid. Never partially accepts a config —
 * a half-valid remote must not degrade into a different host.
 */
export function normalizeRemoteSshConfig(raw: unknown): RemoteSshConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "ssh") return null;

  const host = typeof r.host === "string" ? r.host.trim() : "";
  if (!isValidSshHost(host)) return null;
  const out: RemoteSshConfig = { kind: "ssh", host };

  if (r.user !== undefined && r.user !== null && r.user !== "") {
    if (typeof r.user !== "string" || !isValidSshUser(r.user.trim())) return null;
    out.user = r.user.trim();
  }
  if (r.port !== undefined && r.port !== null && r.port !== "") {
    const port = typeof r.port === "string" ? Number(r.port) : r.port;
    if (typeof port !== "number" || !isValidSshPort(port)) return null;
    out.port = port;
  }
  if (r.jump !== undefined && r.jump !== null && r.jump !== "") {
    if (typeof r.jump !== "string") return null;
    const jump = r.jump.replace(/\s+/gu, "");
    if (!isValidSshJump(jump)) return null;
    out.jump = jump;
  }
  if (r.cwd !== undefined && r.cwd !== null && r.cwd !== "") {
    if (typeof r.cwd !== "string") return null;
    const cwd = r.cwd.trim();
    if (!isValidRemoteCwd(cwd)) return null;
    if (cwd) out.cwd = cwd;
  }
  if (r.identityFile !== undefined && r.identityFile !== null && r.identityFile !== "") {
    if (typeof r.identityFile !== "string") return null;
    const identityFile = r.identityFile.trim();
    if (!isValidIdentityFile(identityFile)) return null;
    out.identityFile = identityFile;
  }
  return out;
}

/** Short label for pane meta / UI, e.g. `ssh:me@box`. */
export function describeRemoteSsh(config: RemoteSshConfig): string {
  return `ssh:${config.user ? `${config.user}@` : ""}${config.host}`;
}

function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** `~` and `~/rest` keep tilde expansion; everything else is single-quoted. */
function remoteCwdExpr(cwd: string): string {
  if (cwd === "~") return "~";
  if (cwd.startsWith("~/")) return `~/${posixQuote(cwd.slice(2))}`;
  return posixQuote(cwd);
}

/**
 * Remote command string for `ssh host <command>`, or `""` for a plain login
 * shell. Wrapped in `bash -lic` (like the WSL path) so nvm / volta / ~/.local/bin
 * are on PATH for npm-installed CLIs, then hands over to the user's login shell.
 * The outer string is parsed by the remote login shell; POSIX single quoting
 * survives bash / zsh / sh / fish.
 */
export function buildRemoteSshCommand(options: { cwd?: string; command?: string }): string {
  const cwd = options.cwd?.trim() ?? "";
  const command = options.command?.trim() ?? "";
  if (!cwd && !command) return "";
  // Shell-only pane: no bash needed (BusyBox / embedded hosts behind a gateway).
  if (!command) return `cd ${remoteCwdExpr(cwd)}; exec "$SHELL" -l`;
  const steps: string[] = [];
  if (cwd) steps.push(`cd ${remoteCwdExpr(cwd)}`);
  steps.push(command);
  steps.push(`exec "\${SHELL:-bash}" -l`);
  return `exec bash -lic ${posixQuote(steps.join("; "))}`;
}

/**
 * Argv for the local `ssh` executable. Re-validates the config so callers can
 * pass a value straight from IPC. `--` ends option parsing before the host.
 */
export function buildSshArgs(config: RemoteSshConfig, command?: string): string[] {
  const safe = normalizeRemoteSshConfig(config);
  if (!safe) throw new Error("Invalid SSH remote configuration");
  const args = [
    "-t",
    "-o",
    `ConnectTimeout=${String(SSH_CONNECT_TIMEOUT_SECONDS)}`,
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
  ];
  if (safe.port) args.push("-p", String(safe.port));
  if (safe.user) args.push("-l", safe.user);
  if (safe.identityFile) args.push("-i", safe.identityFile);
  if (safe.jump) args.push("-J", safe.jump);
  args.push("--", safe.host);
  const remote = buildRemoteSshCommand({ cwd: safe.cwd, command });
  if (remote) args.push(remote);
  return args;
}

/** Ordered places to look for an ssh client; first existing file wins. */
export function sshExecutableCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  const add = (p: string | undefined) => {
    if (p && !out.includes(p)) out.push(p);
  };
  const pathDirs = (env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : delimiter);
  if (platform === "win32") {
    const winJoin = (...parts: string[]) => parts.join("\\").replace(/\\{2,}/g, "\\");
    const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
    add(winJoin(systemRoot, "System32", "OpenSSH", "ssh.exe"));
    for (const dir of pathDirs) if (dir.trim()) add(winJoin(dir.trim(), "ssh.exe"));
    for (const base of [
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA && winJoin(env.LOCALAPPDATA, "Programs"),
    ]) {
      if (base) add(winJoin(base, "Git", "usr", "bin", "ssh.exe"));
    }
    return out;
  }
  for (const dir of pathDirs) if (dir.trim()) add(join(dir.trim(), "ssh"));
  for (const p of ["/usr/bin/ssh", "/usr/local/bin/ssh", "/opt/homebrew/bin/ssh", "/bin/ssh"])
    add(p);
  return out;
}

/** Absolute path of an ssh client on this machine, or `null` when none is installed. */
export function resolveSshExecutable(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): string | null {
  for (const candidate of sshExecutableCandidates(platform, env)) {
    try {
      if (exists(candidate)) return candidate;
    } catch {
      /* unreadable path entry */
    }
  }
  return null;
}
