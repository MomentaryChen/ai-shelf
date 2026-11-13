import type { RemoteSshConfig } from "../types";

/**
 * Form-side mirror of packages/cli/src/runtime/ssh-remote.ts validation.
 * The main process re-validates every spawn; this only gives early feedback.
 */
const HOST_RE = /^[A-Za-z0-9_][A-Za-z0-9._:%-]{0,252}$/u;
const USER_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/u;
const JUMP_HOP_RE =
  /^(?:[A-Za-z0-9_][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9_][A-Za-z0-9._%-]{0,252}(?::\d{1,5})?$/u;

export interface RemoteSshDraft {
  enabled: boolean;
  host: string;
  user: string;
  port: string;
  jump: string;
  cwd: string;
}

export type RemoteSshField = "host" | "user" | "port" | "jump" | "cwd";

export function remoteToDraft(remote: RemoteSshConfig | null | undefined): RemoteSshDraft {
  return {
    enabled: Boolean(remote),
    host: remote?.host ?? "",
    user: remote?.user ?? "",
    port: remote?.port ? String(remote.port) : "",
    jump: remote?.jump ?? "",
    cwd: remote?.cwd ?? "",
  };
}

function validPort(value: string): boolean {
  if (!/^\d{1,5}$/u.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 65535;
}

/** First invalid field, or null when the draft is OK (disabled drafts are always OK). */
export function invalidRemoteField(draft: RemoteSshDraft): RemoteSshField | null {
  if (!draft.enabled) return null;
  if (!HOST_RE.test(draft.host.trim())) return "host";
  const user = draft.user.trim();
  if (user && !USER_RE.test(user)) return "user";
  const port = draft.port.trim();
  if (port && !validPort(port)) return "port";
  const jump = draft.jump.replace(/\s+/gu, "");
  if (jump) {
    const hops = jump.split(",");
    const ok =
      hops.length <= 4 &&
      hops.every((hop) => {
        if (!JUMP_HOP_RE.test(hop)) return false;
        const p = hop.match(/:(\d+)$/u)?.[1];
        return p === undefined || validPort(p);
      });
    if (!ok) return "jump";
  }
  // eslint-disable-next-line no-control-regex
  if (draft.cwd.length > 1024 || /[\u0000-\u001f\u007f]/u.test(draft.cwd)) return "cwd";
  return null;
}

/** Draft → config for profileUpdate (null = local profile). Call after validation. */
export function draftToRemote(draft: RemoteSshDraft): RemoteSshConfig | null {
  if (!draft.enabled) return null;
  const out: RemoteSshConfig = { kind: "ssh", host: draft.host.trim() };
  const user = draft.user.trim();
  if (user) out.user = user;
  const port = draft.port.trim();
  if (port) out.port = Number(port);
  const jump = draft.jump.replace(/\s+/gu, "");
  if (jump) out.jump = jump;
  const cwd = draft.cwd.trim();
  if (cwd) out.cwd = cwd;
  return out;
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
