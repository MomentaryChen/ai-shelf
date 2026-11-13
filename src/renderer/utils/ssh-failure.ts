/**
 * Classify why an ssh pane ended, from the tail of its terminal output.
 * ssh exits with 255 for its own errors (vs. the remote command's exit code).
 */
export type SshFailureKind =
  | "keyfile"
  | "auth"
  | "hostkey"
  | "resolve"
  | "timeout"
  | "refused"
  | "jump"
  | "unknown";

export const SSH_ERROR_EXIT_CODE = 255;

/** Ordered: the first match wins (more specific causes first). */
const RULES: readonly (readonly [SshFailureKind, RegExp])[] = [
  ["hostkey", /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i],
  [
    "keyfile",
    /no such identity|Load key .*(invalid format|No such file|bad permissions)|UNPROTECTED PRIVATE KEY FILE|bad passphrase/i,
  ],
  ["auth", /Permission denied \(|Too many authentication failures|Authentication failed/i],
  // Via a jump host, refused / timeout may be the gateway or the target — say so.
  [
    "jump",
    /Connection closed by UNKNOWN port 65535|stdio forwarding failed|channel \d+: open failed/i,
  ],
  ["resolve", /Could not resolve hostname|Name or service not known|nodename nor servname/i],
  ["timeout", /timed out|Operation timed out/i],
  ["refused", /Connection refused/i],
];

export function classifySshFailure(output: string): SshFailureKind {
  // Only look at the tail: the failure is printed right before ssh exits.
  const tail = output.slice(-4000);
  for (const [kind, re] of RULES) {
    if (re.test(tail)) return kind;
  }
  return "unknown";
}

/** Pane meta `shell` for remote panes is `ssh:[user@]host` (see main `describeRemoteSsh`). */
export function isSshPaneShell(shell: string | null | undefined): boolean {
  return typeof shell === "string" && shell.startsWith("ssh:");
}
