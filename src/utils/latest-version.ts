import { canonicalToolId, TOOL_GITHUB_REPO, TOOL_NPM_PACKAGE } from "../tools.js";
import { run } from "./exec.js";
import { parseCliVersionLine } from "./version.js";

const NPM_LATEST_TTL_MS = 60 * 60 * 1000;
const NPM_LATEST_TIMEOUT_MS = 10_000;
const npmLatestCache = new Map<string, { at: number; version: string }>();
const npmLatestInFlight = new Map<string, Promise<string | null>>();

/** Registry path for a package name. Scoped names keep `@` but escape the slash (`@scope%2fname`). */
export function npmRegistryLatestUrl(pkg: string): string {
  return `https://registry.npmjs.org/${pkg.replace("/", "%2f")}/latest`;
}

async function fetchNpmLatestFromRegistry(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(npmRegistryLatestUrl(pkg), {
      headers: { Accept: "application/json", "User-Agent": "ai-shelf" },
      signal: AbortSignal.timeout(NPM_LATEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === "string" && data.version ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Latest published version of an npm package, or null on failure.
 * Hits the public registry directly; falls back to `npm view` (async) so
 * proxies / private registries from `.npmrc` still work. Successful results
 * are cached for an hour and concurrent lookups share one request.
 */
export function fetchLatestNpmVersion(pkg: string): Promise<string | null> {
  const cached = npmLatestCache.get(pkg);
  if (cached && Date.now() - cached.at < NPM_LATEST_TTL_MS) {
    return Promise.resolve(cached.version);
  }
  const inflight = npmLatestInFlight.get(pkg);
  if (inflight) return inflight;

  const pending = (async () => {
    try {
      let version = await fetchNpmLatestFromRegistry(pkg);
      if (!version) {
        const res = await run("npm", ["view", pkg, "version"], NPM_LATEST_TIMEOUT_MS);
        version = res.ok && res.stdout ? res.stdout : null;
      }
      // Failures are not cached so an offline start does not pin "no update info".
      if (version) npmLatestCache.set(pkg, { at: Date.now(), version });
      return version;
    } catch {
      return null;
    } finally {
      npmLatestInFlight.delete(pkg);
    }
  })();
  npmLatestInFlight.set(pkg, pending);
  return pending;
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
