import { execSync } from "node:child_process";
import { canonicalToolId, TOOL_GITHUB_REPO, TOOL_NPM_PACKAGE } from "../tools.js";
import { parseCliVersionLine } from "./version.js";

export function fetchLatestNpmVersion(pkg: string): string | null {
  try {
    return execSync(`npm view ${pkg} version`, {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

/** Fetch latest stable GitHub release tag and normalize to a semver-ish string. */
export async function fetchLatestGitHubRelease(repo: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-shelf",
    };
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    if (!data.tag_name) return null;
    return parseCliVersionLine(data.tag_name.replace(/^v/i, ""));
  } catch {
    return null;
  }
}

/** Resolve remote latest for a tool via npm registry or GitHub Releases. */
export async function fetchRemoteLatestVersion(tool: string): Promise<string | null> {
  const id = canonicalToolId(tool);
  const pkg = TOOL_NPM_PACKAGE[id];
  if (pkg) return fetchLatestNpmVersion(pkg);
  const repo = TOOL_GITHUB_REPO[id];
  if (repo) return fetchLatestGitHubRelease(repo);
  return null;
}

/**
 * Prefer a remote latest when available. For tools with no registry/release source,
 * optionally fall back to the installed version (post-update refresh / recheck).
 */
export function resolveToolLatestVersion(
  tool: string,
  available: boolean,
  currentVersion: string | null,
  remoteLatest: string | null | undefined,
  inferUntrackedFromInstalled = false,
): string | null {
  if (!available) return null;
  if (remoteLatest != null) return remoteLatest;
  const id = canonicalToolId(tool);
  if (id in TOOL_NPM_PACKAGE || id in TOOL_GITHUB_REPO) return null;
  if (inferUntrackedFromInstalled) return currentVersion ?? null;
  return null;
}
