/**
 * Team config policy — forbid/require MCP servers & skills, plus optional
 * source-of-truth tool ids for cross-tool align/sync.
 *
 * File format (JSON): `%APPDATA%/ai-shelf/team-policy.json` (or imported path).
 */

export const TEAM_POLICY_VERSION = 1 as const;

export type TeamPolicy = {
  version: typeof TEAM_POLICY_VERSION;
  /** Optional display name for the policy (e.g. team or repo). */
  name?: string;
  sourceOfTruth?: {
    mcp?: string;
    skills?: string;
  };
  mcp?: {
    /** Server names that must exist on every MCP sync-capable tool. */
    required?: string[];
    /** Server names that must not exist; blocked from sync writes. */
    forbidden?: string[];
  };
  skills?: {
    /** Skill names that must exist on every skill sync-capable tool. */
    required?: string[];
    /** Skill names that must not exist; blocked from sync writes. */
    forbidden?: string[];
  };
};

export type PolicyViolationKind =
  | "mcp-forbidden"
  | "mcp-required"
  | "skill-forbidden"
  | "skill-required";

export type PolicyViolation = {
  kind: PolicyViolationKind;
  name: string;
  tool: string;
};

export const EMPTY_TEAM_POLICY: TeamPolicy = { version: TEAM_POLICY_VERSION };

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function asOptionalToolId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Parse and normalize unknown JSON into a TeamPolicy (never throws). */
export function parseTeamPolicy(raw: unknown): TeamPolicy {
  if (!raw || typeof raw !== "object") return { ...EMPTY_TEAM_POLICY };

  const data = raw as Record<string, unknown>;
  const sot =
    data.sourceOfTruth && typeof data.sourceOfTruth === "object"
      ? (data.sourceOfTruth as Record<string, unknown>)
      : undefined;
  const mcp = data.mcp && typeof data.mcp === "object" ? (data.mcp as Record<string, unknown>) : undefined;
  const skills =
    data.skills && typeof data.skills === "object" ? (data.skills as Record<string, unknown>) : undefined;

  const policy: TeamPolicy = { version: TEAM_POLICY_VERSION };

  if (typeof data.name === "string" && data.name.trim()) {
    policy.name = data.name.trim();
  }

  const mcpSot = asOptionalToolId(sot?.mcp);
  const skillsSot = asOptionalToolId(sot?.skills);
  if (mcpSot || skillsSot) {
    policy.sourceOfTruth = {};
    if (mcpSot) policy.sourceOfTruth.mcp = mcpSot;
    if (skillsSot) policy.sourceOfTruth.skills = skillsSot;
  }

  if (mcp) {
    const required = asStringList(mcp.required);
    const forbidden = asStringList(mcp.forbidden);
    if (required.length || forbidden.length) {
      policy.mcp = {};
      if (required.length) policy.mcp.required = required;
      if (forbidden.length) policy.mcp.forbidden = forbidden;
    }
  }

  if (skills) {
    const required = asStringList(skills.required);
    const forbidden = asStringList(skills.forbidden);
    if (required.length || forbidden.length) {
      policy.skills = {};
      if (required.length) policy.skills.required = required;
      if (forbidden.length) policy.skills.forbidden = forbidden;
    }
  }

  return policy;
}

export function normalizeTeamPolicy(policy: TeamPolicy): TeamPolicy {
  return parseTeamPolicy(policy);
}

/** True when the policy has any rule beyond the empty default. */
export function hasPolicyRules(policy: TeamPolicy): boolean {
  return Boolean(
    policy.name ||
      policy.sourceOfTruth?.mcp ||
      policy.sourceOfTruth?.skills ||
      policy.mcp?.required?.length ||
      policy.mcp?.forbidden?.length ||
      policy.skills?.required?.length ||
      policy.skills?.forbidden?.length,
  );
}

export function isMcpForbidden(policy: TeamPolicy, serverName: string): boolean {
  return Boolean(policy.mcp?.forbidden?.includes(serverName));
}

export function isSkillForbidden(policy: TeamPolicy, skillName: string): boolean {
  return Boolean(policy.skills?.forbidden?.includes(skillName));
}

/**
 * Evaluate presence against forbid/require rules.
 * `mcpByTool` / `skillsByTool` map tool id → installed names.
 */
export function evaluateTeamPolicy(
  policy: TeamPolicy,
  mcpByTool: Record<string, string[]>,
  skillsByTool: Record<string, string[]>,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const mcpTools = Object.keys(mcpByTool);
  const skillTools = Object.keys(skillsByTool);

  for (const name of policy.mcp?.forbidden ?? []) {
    for (const tool of mcpTools) {
      if (mcpByTool[tool]?.includes(name)) {
        violations.push({ kind: "mcp-forbidden", name, tool });
      }
    }
  }

  for (const name of policy.mcp?.required ?? []) {
    for (const tool of mcpTools) {
      if (!mcpByTool[tool]?.includes(name)) {
        violations.push({ kind: "mcp-required", name, tool });
      }
    }
  }

  for (const name of policy.skills?.forbidden ?? []) {
    for (const tool of skillTools) {
      if (skillsByTool[tool]?.includes(name)) {
        violations.push({ kind: "skill-forbidden", name, tool });
      }
    }
  }

  for (const name of policy.skills?.required ?? []) {
    for (const tool of skillTools) {
      if (!skillsByTool[tool]?.includes(name)) {
        violations.push({ kind: "skill-required", name, tool });
      }
    }
  }

  return violations.sort((a, b) => {
    const kind = a.kind.localeCompare(b.kind);
    if (kind !== 0) return kind;
    const name = a.name.localeCompare(b.name);
    if (name !== 0) return name;
    return a.tool.localeCompare(b.tool);
  });
}

/** Filter sync candidates so forbidden names never write. */
export function filterAllowedMcpNames(policy: TeamPolicy, names: string[]): string[] {
  const forbidden = new Set(policy.mcp?.forbidden ?? []);
  return names.filter((n) => !forbidden.has(n));
}

export function filterAllowedSkillNames(policy: TeamPolicy, names: string[]): string[] {
  const forbidden = new Set(policy.skills?.forbidden ?? []);
  return names.filter((n) => !forbidden.has(n));
}
