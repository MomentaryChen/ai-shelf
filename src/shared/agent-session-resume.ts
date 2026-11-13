/**
 * Resume AI agent conversations when terminal panes are restored.
 *
 * Pure helpers (no fs / Electron) shared by the pty-spawn handler and tests.
 *
 * Claude Code: a fresh pane launches with `--session-id <uuid>`; the id is kept on
 * the pane and saved in the layout. On restore / restart the pane launches with
 * `--resume <uuid>` when the transcript `<config>/projects/<encoded-cwd>/<uuid>.jsonl`
 * exists, else fresh with a new id.
 *
 * Limitation: `/clear` inside Claude starts a new session id that we cannot see,
 * so a restore resumes the conversation from before the `/clear`. A "newest
 * .jsonl in the project dir" heuristic is deliberately not used — parallel panes
 * in the same cwd share that dir and would get cross-wired.
 *
 * Extension point: other tools join by adding an entry to AGENT_SESSION_LAUNCHERS
 * once they have a reliable way to pin a session id at launch and resume it later
 * (plus a transcript check in src/electron/agent-session.ts). Only Claude Code is
 * implemented; Codex (`codex resume <id>`) is not, because we have no verified way
 * to choose or learn its session id when a pane starts.
 */

export interface AgentSessionLauncher {
  /** Flags that start a new conversation with a caller-chosen id. */
  freshArgs: (sessionId: string) => string;
  /** Flags that reopen an existing conversation. */
  resumeArgs: (sessionId: string) => string;
  /** User launch flags that already pick a conversation (we then add nothing). */
  conflictingFlags: readonly string[];
}

const AGENT_SESSION_LAUNCHERS: Record<string, AgentSessionLauncher> = {
  claude: {
    freshArgs: (id) => `--session-id ${id}`,
    resumeArgs: (id) => `--resume ${id}`,
    conflictingFlags: ["--resume", "-r", "--continue", "-c", "--session-id", "--fork-session"],
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Session ids are interpolated into a shell command line — accept UUIDs only. */
export function isValidAgentSessionId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

export function agentSessionSupported(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(AGENT_SESSION_LAUNCHERS, tool);
}

/**
 * True when the user's own launch args already choose a conversation
 * (whole-token match, plus `--flag=value` and bundled short-flag forms).
 */
export function userArgsControlSession(tool: string, extraArgs: string | undefined): boolean {
  const launcher = AGENT_SESSION_LAUNCHERS[tool];
  if (!launcher) return false;
  const tokens = (extraArgs ?? "").trim().split(/\s+/).filter(Boolean);
  const shortFlags = launcher.conflictingFlags.filter((f) => /^-[a-zA-Z]$/.test(f));
  return tokens.some((token) => {
    const flag = token.startsWith("--") ? token.split("=", 1)[0]! : token;
    if (launcher.conflictingFlags.includes(flag)) return true;
    // Bundled short flags (`-cr`) — be conservative and treat any match as user-controlled.
    if (/^-[a-zA-Z]{2,}$/.test(token)) {
      return shortFlags.some((f) => token.includes(f.slice(1)));
    }
    return false;
  });
}

/**
 * Claude Code's project folder name for a cwd: every character that is not an
 * ASCII letter or digit becomes `-` (case kept), e.g.
 * `D:\projects\ai-shelf\.claude` → `D--projects-ai-shelf--claude`.
 */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Claude is believed to shorten very long folder names (first 200 chars + `-<hash>`);
 * not verified on disk, so we prefix-match instead of recomputing the hash.
 */
const CLAUDE_PROJECT_DIR_MAX = 200;

/**
 * Whether an existing `projects/` folder name belongs to `cwd`. Case-insensitive
 * when the filesystem is (Windows / macOS) — Claude keeps whatever drive-letter
 * case the process saw (`d--workspace` vs `D--workspace`).
 */
export function claudeProjectDirMatches(
  dirName: string,
  cwd: string,
  caseInsensitive: boolean,
): boolean {
  const norm = (s: string) => (caseInsensitive ? s.toLowerCase() : s);
  const encoded = norm(encodeClaudeProjectDir(cwd));
  const name = norm(dirName);
  if (name === encoded) return true;
  if (encoded.length > CLAUDE_PROJECT_DIR_MAX) {
    return name.startsWith(`${encoded.slice(0, CLAUDE_PROJECT_DIR_MAX)}-`);
  }
  return false;
}

export interface AgentSessionLaunchInput {
  tool: string;
  extraArgs?: string;
  /** Id saved on the pane from its previous launch. */
  resumeId?: string;
  /** Whether a transcript for `id` exists for this cwd. */
  transcriptExists: (id: string) => boolean;
  newId: () => string;
}

export interface AgentSessionLaunchPlan {
  /** Launch args to use (user args plus any session flags). */
  extraArgs: string | undefined;
  /** Conversation id the pane now holds; undefined when we did not manage it. */
  sessionId?: string;
  resumed: boolean;
}

export function planAgentSessionLaunch(input: AgentSessionLaunchInput): AgentSessionLaunchPlan {
  const { tool, extraArgs } = input;
  const launcher = AGENT_SESSION_LAUNCHERS[tool];
  if (!launcher || userArgsControlSession(tool, extraArgs)) {
    return { extraArgs, resumed: false };
  }
  const append = (flags: string) => {
    const base = (extraArgs ?? "").trim();
    return base ? `${base} ${flags}` : flags;
  };
  const resumeId = input.resumeId;
  if (isValidAgentSessionId(resumeId) && input.transcriptExists(resumeId)) {
    return { extraArgs: append(launcher.resumeArgs(resumeId)), sessionId: resumeId, resumed: true };
  }
  const id = input.newId();
  if (!isValidAgentSessionId(id)) return { extraArgs, resumed: false };
  return { extraArgs: append(launcher.freshArgs(id)), sessionId: id, resumed: false };
}
