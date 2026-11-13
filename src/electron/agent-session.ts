import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { claudeProjectDirMatches, isValidAgentSessionId } from "../shared/agent-session-resume.js";

/**
 * Claude Code config dir as the pane's process will see it: `CLAUDE_CONFIG_DIR`
 * from the PTY env when set to an absolute path, else `~/.claude`.
 */
export function claudeConfigDirForEnv(env: Record<string, string | undefined>): string {
  const raw = env.CLAUDE_CONFIG_DIR?.trim();
  return raw && isAbsolute(raw) ? raw : join(homedir(), ".claude");
}

/** True when `<config>/projects/<encoded cwd>/<sessionId>.jsonl` exists. */
export function claudeTranscriptExists(configDir: string, cwd: string, sessionId: string): boolean {
  if (!isValidAgentSessionId(sessionId)) return false;
  const projectsDir = join(configDir, "projects");
  let names: string[];
  try {
    names = readdirSync(projectsDir);
  } catch {
    return false;
  }
  const caseInsensitive = process.platform === "win32" || process.platform === "darwin";
  return names.some(
    (name) =>
      claudeProjectDirMatches(name, cwd, caseInsensitive) &&
      existsSync(join(projectsDir, name, `${sessionId}.jsonl`)),
  );
}
