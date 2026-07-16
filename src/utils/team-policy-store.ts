import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import {
  EMPTY_TEAM_POLICY,
  normalizeTeamPolicy,
  parseTeamPolicy,
  type TeamPolicy,
} from "../shared/team-policy.js";

export const TEAM_POLICY_FILENAME = "team-policy.json";

export function getTeamPolicyPath(): string {
  return join(getAppDataDir(), TEAM_POLICY_FILENAME);
}

export function readTeamPolicy(): TeamPolicy {
  try {
    const path = getTeamPolicyPath();
    if (!existsSync(path)) return { ...EMPTY_TEAM_POLICY };
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parseTeamPolicy(raw);
  } catch {
    return { ...EMPTY_TEAM_POLICY };
  }
}

export function writeTeamPolicy(policy: TeamPolicy): TeamPolicy {
  const normalized = normalizeTeamPolicy(policy);
  const path = getTeamPolicyPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

/** Import a policy JSON file from an absolute path (team-shared file). */
export function importTeamPolicyFromPath(filePath: string): {
  ok: boolean;
  policy: TeamPolicy;
  error?: string;
} {
  try {
    if (!filePath || typeof filePath !== "string") {
      return { ok: false, policy: readTeamPolicy(), error: "Invalid path" };
    }
    if (!existsSync(filePath)) {
      return { ok: false, policy: readTeamPolicy(), error: "File not found" };
    }
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
    const policy = writeTeamPolicy(parseTeamPolicy(raw));
    return { ok: true, policy };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, policy: readTeamPolicy(), error: message };
  }
}

export function exportTeamPolicyToPath(filePath: string): { ok: boolean; error?: string } {
  try {
    if (!filePath || typeof filePath !== "string") {
      return { ok: false, error: "Invalid path" };
    }
    const policy = readTeamPolicy();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(policy, null, 2)}\n`, "utf-8");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
