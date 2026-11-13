import type { RemoteSshConfig, SshHop } from "../types";

/**
 * Form-side mirror of packages/cli/src/runtime/ssh-remote.ts validation.
 * The main process re-validates every spawn; this only gives early feedback.
 */
const HOST_RE = /^[A-Za-z0-9_][A-Za-z0-9._:-]{0,252}$/u;
const USER_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;

export const MAX_SSH_JUMP_HOSTS = 4;

/** One endpoint as typed in the form (all strings). */
export interface SshHopDraft {
  /** Stable React key; not persisted. */
  key: string;
  host: string;
  user: string;
  port: string;
  identityFile: string;
}

export interface RemoteSshDraft {
  enabled: boolean;
  target: SshHopDraft;
  /** Connection order: this computer → jumpHosts[0] → … → target. */
  jumpHosts: SshHopDraft[];
  cwd: string;
}

export type SshHopField = "host" | "user" | "port" | "identityFile";
export type RemoteSshField = SshHopField | "cwd";

/** Where the first invalid value is: the target, a jump host (index), or the remote dir. */
export interface RemoteSshInvalid {
  hop: "target" | number;
  field: RemoteSshField;
}

let hopKeySeq = 0;
function nextHopKey(): string {
  hopKeySeq += 1;
  return `hop-${String(hopKeySeq)}`;
}

export function hopToDraft(hop: SshHop | null | undefined): SshHopDraft {
  return {
    key: nextHopKey(),
    host: hop?.host ?? "",
    user: hop?.user ?? "",
    port: hop?.port ? String(hop.port) : "",
    identityFile: hop?.identityFile ?? "",
  };
}

export function emptyHopDraft(): SshHopDraft {
  return hopToDraft(null);
}

export function remoteToDraft(remote: RemoteSshConfig | null | undefined): RemoteSshDraft {
  return {
    enabled: Boolean(remote),
    target: hopToDraft(remote),
    jumpHosts: (remote?.jumpHosts ?? []).map((hop) => hopToDraft(hop)),
    cwd: remote?.cwd ?? "",
  };
}

function validPort(value: string): boolean {
  if (!/^\d{1,5}$/u.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 65535;
}

function invalidHopField(hop: SshHopDraft): SshHopField | null {
  if (!HOST_RE.test(hop.host.trim())) return "host";
  const user = hop.user.trim();
  if (user && !USER_RE.test(user)) return "user";
  const port = hop.port.trim();
  if (port && !validPort(port)) return "port";
  const key = hop.identityFile.trim();
  if (
    key &&
    (key.length > 1024 ||
      key.startsWith("-") ||
      key.includes("%") ||
      key.includes('"') ||
      CONTROL_RE.test(key))
  ) {
    return "identityFile";
  }
  return null;
}

/** First invalid value, or null when the draft is OK (disabled drafts are always OK). */
export function invalidRemoteField(draft: RemoteSshDraft): RemoteSshInvalid | null {
  if (!draft.enabled) return null;
  for (let i = 0; i < draft.jumpHosts.length; i++) {
    const field = invalidHopField(draft.jumpHosts[i]!);
    if (field) return { hop: i, field };
  }
  const targetField = invalidHopField(draft.target);
  if (targetField) return { hop: "target", field: targetField };
  if (draft.cwd.length > 1024 || CONTROL_RE.test(draft.cwd)) return { hop: "target", field: "cwd" };
  return null;
}

function draftToHop(hop: SshHopDraft): SshHop {
  const out: SshHop = { host: hop.host.trim() };
  const user = hop.user.trim();
  if (user) out.user = user;
  const port = hop.port.trim();
  if (port) out.port = Number(port);
  const identityFile = hop.identityFile.trim();
  if (identityFile) out.identityFile = identityFile;
  return out;
}

/** Draft → config for profileCreate / profileUpdate (null = local profile). Call after validation. */
export function draftToRemote(draft: RemoteSshDraft): RemoteSshConfig | null {
  if (!draft.enabled) return null;
  const out: RemoteSshConfig = { kind: "ssh", ...draftToHop(draft.target) };
  if (draft.jumpHosts.length > 0) out.jumpHosts = draft.jumpHosts.map(draftToHop);
  const cwd = draft.cwd.trim();
  if (cwd) out.cwd = cwd;
  return out;
}

/** `me@box` / `box` (or a placeholder while the host is still empty). */
export function hopDraftLabel(hop: SshHopDraft, placeholder: string): string {
  const host = hop.host.trim();
  if (!host) return placeholder;
  const user = hop.user.trim();
  return `${user ? `${user}@` : ""}${host}`;
}

/**
 * A pane cwd reported by a remote pane (`[user@]host:dir`). Windows drive paths
 * (`C:\…`) have a one-letter prefix and are never matched.
 */
export function isRemotePaneCwd(cwd: string | undefined): boolean {
  const value = cwd?.trim() ?? "";
  return /^[^\\/:\s]{2,}:/u.test(value);
}

/** `me@box` / `box` — for labels. */
export function remoteLabel(remote: RemoteSshConfig): string {
  return `${remote.user ? `${remote.user}@` : ""}${remote.host}`;
}
