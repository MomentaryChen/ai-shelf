/**
 * SSH remote profiles: validation, `ssh` argv building and client discovery.
 *
 * Profiles sync through the cloud, so a remote config is untrusted input that
 * ends up as `ssh` arguments on this machine. Only structured fields are
 * accepted (target + ordered jump hosts: host / user / port / key path, plus a
 * remote dir) and each is checked against a strict charset — no free-form ssh
 * options, no `ProxyCommand`, no secrets. Agents and other per-host options
 * stay in the user's `~/.ssh/config`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

/** One SSH endpoint: a jump host (gateway) or the target. */
export interface SshHop {
  /** Hostname, IP, or a `Host` alias from ~/.ssh/config. */
  host: string;
  user?: string;
  port?: number;
  /**
   * Local private key. Only the path is stored, never key material; ssh also
   * loads `<key>-cert.pub` next to it for certificate login. A path missing on
   * this machine just falls back to agent / ~/.ssh/config keys.
   */
  identityFile?: string;
}

export interface RemoteSshConfig extends SshHop {
  kind: "ssh";
  /**
   * Jump hosts in connection order (this computer → jumpHosts[0] → … → target).
   * Empty / omitted = direct connection.
   */
  jumpHosts?: SshHop[];
  /** Remote start directory; empty = remote login directory. `~` / `~/…` allowed. */
  cwd?: string;
}

export const SSH_CLIENT_NOT_FOUND_ERROR = "SSH client not found";
export const MAX_SSH_JUMP_HOSTS = 4;

const HOST_RE = /^[A-Za-z0-9_][A-Za-z0-9._:-]{0,252}$/u;
const USER_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/u;
/** Legacy `jump` string hop: `[user@]host[:port]`. */
const LEGACY_HOP_RE =
  /^(?:([A-Za-z0-9_][A-Za-z0-9._-]{0,63})@)?([A-Za-z0-9_][A-Za-z0-9._-]{0,252})(?::(\d{1,5}))?$/u;
const MAX_REMOTE_CWD = 1024;
const MAX_IDENTITY_PATH = 1024;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
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

export function isValidRemoteCwd(value: string): boolean {
  return value.length <= MAX_REMOTE_CWD && !CONTROL_RE.test(value);
}

export function isValidIdentityFile(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_IDENTITY_PATH &&
    !value.startsWith("-") &&
    // ssh stat()s the literal -i path, then %-expands it: a `%` can never work
    // (escaping as %% fails the stat, raw % is mis-expanded), so reject it.
    !value.includes("%") &&
    // Written as a quoted value in the generated jump-host ssh_config.
    !value.includes('"') &&
    !CONTROL_RE.test(value)
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Validate one endpoint; `null` when any provided field is invalid. */
function normalizeHop(raw: unknown): SshHop | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const host = typeof r.host === "string" ? r.host.trim() : "";
  if (!isValidSshHost(host)) return null;
  const out: SshHop = { host };
  if (!isBlank(r.user)) {
    if (typeof r.user !== "string" || !isValidSshUser(r.user.trim())) return null;
    out.user = r.user.trim();
  }
  if (!isBlank(r.port)) {
    const port = typeof r.port === "string" ? Number(r.port) : r.port;
    if (typeof port !== "number" || !isValidSshPort(port)) return null;
    out.port = port;
  }
  if (!isBlank(r.identityFile)) {
    if (typeof r.identityFile !== "string") return null;
    const identityFile = r.identityFile.trim();
    if (!isValidIdentityFile(identityFile)) return null;
    out.identityFile = identityFile;
  }
  return out;
}

/** Earlier builds stored jump hosts as `[user@]host[:port],…`. */
function parseLegacyJump(value: string): SshHop[] | null {
  const hops: SshHop[] = [];
  for (const part of value.replace(/\s+/gu, "").split(",")) {
    const m = LEGACY_HOP_RE.exec(part);
    if (!m) return null;
    const hop = normalizeHop({ host: m[2], user: m[1], port: m[3] });
    if (!hop) return null;
    hops.push(hop);
  }
  return hops;
}

/**
 * Normalize untrusted input (IPC, sync bundle, DB row) into a config, or `null`
 * when it is absent or any field is invalid. Never partially accepts a config —
 * a half-valid remote must not degrade into a different host or route.
 */
export function normalizeRemoteSshConfig(raw: unknown): RemoteSshConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "ssh") return null;

  const target = normalizeHop(r);
  if (!target) return null;
  const out: RemoteSshConfig = { kind: "ssh", ...target };

  let jumpHosts: SshHop[] = [];
  if (!isBlank(r.jumpHosts)) {
    if (!Array.isArray(r.jumpHosts)) return null;
    for (const hop of r.jumpHosts) {
      const safe = normalizeHop(hop);
      if (!safe) return null;
      jumpHosts.push(safe);
    }
  } else if (!isBlank(r.jump)) {
    if (typeof r.jump !== "string") return null;
    const legacy = parseLegacyJump(r.jump);
    if (!legacy) return null;
    jumpHosts = legacy;
  }
  if (jumpHosts.length > MAX_SSH_JUMP_HOSTS) return null;
  if (jumpHosts.length > 0) out.jumpHosts = jumpHosts;

  if (!isBlank(r.cwd)) {
    if (typeof r.cwd !== "string") return null;
    const cwd = r.cwd.trim();
    if (!isValidRemoteCwd(cwd)) return null;
    if (cwd) out.cwd = cwd;
  }
  return out;
}

function hopLabel(hop: SshHop): string {
  return `${hop.user ? `${hop.user}@` : ""}${hop.host}`;
}

/** Short label for pane meta / UI, e.g. `ssh:me@box`. */
export function describeRemoteSsh(config: RemoteSshConfig): string {
  return `ssh:${hopLabel(config)}`;
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
 * ProxyJump cannot carry a per-hop key, so jump hosts with a private key get a
 * generated `Host` alias in a small ssh_config. ssh passes `-F` to the jump
 * processes it spawns, so each hop uses its own key. The file ends with
 * `Include ~/.ssh/config`, keeping the user's own settings (agent, defaults,
 * aliases of the other hops) in effect. Hops without a key stay plain `-J`
 * entries, so ~/.ssh/config aliases keep working for them.
 *
 * `fileName` is content-addressed: identical routes share one file.
 */
export function buildSshJumpConfig(
  config: RemoteSshConfig,
): { fileName: string; text: string; jump: string } | null {
  const hops = config.jumpHosts ?? [];
  if (!hops.some((hop) => hop.identityFile)) return null;
  const blocks: string[] = [];
  const route: string[] = [];
  const id = createHash("sha256").update(JSON.stringify(hops)).digest("hex").slice(0, 12);
  hops.forEach((hop, index) => {
    if (!hop.identityFile) {
      route.push(`${hopLabel(hop)}${hop.port ? `:${String(hop.port)}` : ""}`);
      return;
    }
    const alias = `aishelf-${id}-hop${String(index + 1)}`;
    route.push(alias);
    const lines = [`Host ${alias}`, `  HostName ${hop.host}`];
    if (hop.user) lines.push(`  User ${hop.user}`);
    if (hop.port) lines.push(`  Port ${String(hop.port)}`);
    lines.push(`  IdentityFile "${hop.identityFile}"`);
    blocks.push(lines.join("\n"));
  });
  blocks.push("Match all\n  Include ~/.ssh/config");
  const text = `# Generated by AI Shelf for an SSH profile route. Safe to delete.\n${blocks.join("\n\n")}\n`;
  return { fileName: `aishelf-${id}.conf`, text, jump: route.join(",") };
}

/** `-J` value without a generated config (no jump host has a key). */
function plainJump(hops: SshHop[]): string {
  return hops.map((hop) => `${hopLabel(hop)}${hop.port ? `:${String(hop.port)}` : ""}`).join(",");
}

/**
 * Write the generated jump-host config (if the route needs one) into `dir`.
 * ssh truncates long `-F` paths when it forwards them to jump processes, so the
 * caller must start ssh with `cwd = dir` and pass only the bare file name.
 */
export function prepareSshJumpConfig(
  config: RemoteSshConfig,
  dir: string,
): { dir: string; fileName: string } | null {
  const generated = buildSshJumpConfig(config);
  if (!generated) return null;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, generated.fileName);
  let current: string | null = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    /* not written yet */
  }
  if (current !== generated.text) writeFileSync(path, generated.text, "utf8");
  return { dir, fileName: generated.fileName };
}

/**
 * Argv for the local `ssh` executable. Re-validates the config so callers can
 * pass a value straight from IPC. `--` ends option parsing before the host.
 * `jumpConfigFile` is the bare name from {@link prepareSshJumpConfig}; it is
 * required when a jump host has a private key.
 */
export function buildSshArgs(
  config: RemoteSshConfig,
  command?: string,
  options?: { jumpConfigFile?: string },
): string[] {
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
  const generated = buildSshJumpConfig(safe);
  if (generated) {
    if (options?.jumpConfigFile !== generated.fileName) {
      throw new Error("SSH jump host config was not prepared");
    }
    args.push("-F", generated.fileName);
  }
  if (safe.port) args.push("-p", String(safe.port));
  if (safe.user) args.push("-l", safe.user);
  if (safe.identityFile) args.push("-i", safe.identityFile);
  const hops = safe.jumpHosts ?? [];
  if (hops.length > 0) args.push("-J", generated ? generated.jump : plainJump(hops));
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
