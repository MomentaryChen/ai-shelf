import { adaptMcpEntry } from "./mcp-sync.js";
import type { McpServerEntry } from "./mcp-codex-toml.js";

const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0.1";

export type McpRegistryTransport = "stdio" | "remote";

export interface McpRegistryEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
}

export interface McpRegistryArg {
  name: string;
  description?: string;
  isRequired?: boolean;
  default?: string;
  type?: string;
}

export interface McpRegistryServerItem {
  id: string;
  title?: string;
  description?: string;
  version: string;
  transport: McpRegistryTransport;
  websiteUrl?: string;
  repositoryUrl?: string;
}

export interface McpRegistryListResult {
  servers: McpRegistryServerItem[];
  nextCursor?: string;
  error?: string;
}

export interface McpRegistryInstallPreview {
  registryId: string;
  suggestedName: string;
  title?: string;
  description?: string;
  transport: McpRegistryTransport;
  entry: McpServerEntry;
  envVars: McpRegistryEnvVar[];
  packageArgs: McpRegistryArg[];
}

interface RegistryArgDef {
  name?: string;
  value?: string;
  valueHint?: string;
  type?: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
  format?: string;
}

interface RegistryPackage {
  registryType?: string;
  identifier?: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type?: string; url?: string };
  runtimeArguments?: RegistryArgDef[];
  packageArguments?: RegistryArgDef[];
  environmentVariables?: RegistryArgDef[];
}

interface RegistryRemote {
  type?: string;
  url?: string;
}

interface RegistryServerJson {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url?: string };
  packages?: RegistryPackage[];
  remotes?: RegistryRemote[];
}

interface RegistryListResponse {
  servers?: Array<{ server?: RegistryServerJson }>;
  metadata?: { nextCursor?: string; count?: number };
}

interface RegistryDetailResponse {
  server?: RegistryServerJson;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function registryNameToLocalName(registryName: string): string {
  const slash = registryName.lastIndexOf("/");
  const base = slash >= 0 ? registryName.slice(slash + 1) : registryName;
  return base.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function formatArgFlag(name: string): string {
  return name.startsWith("-") ? name : `--${name}`;
}

function pickStdioPackage(packages: RegistryPackage[] | undefined): RegistryPackage | undefined {
  if (!packages?.length) return undefined;
  return (
    packages.find((p) => p.transport?.type === "stdio" && p.identifier) ??
    packages.find((p) => p.identifier && (!p.transport?.type || p.transport.type === "stdio"))
  );
}

function pickRemote(remotes: RegistryRemote[] | undefined): RegistryRemote | undefined {
  if (!remotes?.length) return undefined;
  return (
    remotes.find((r) => r.type === "streamable-http" && r.url) ??
    remotes.find((r) => r.url)
  );
}

function mapEnvVars(vars: RegistryArgDef[] | undefined): McpRegistryEnvVar[] {
  return (vars ?? [])
    .filter((v) => v.name)
    .map((v) => ({
      name: v.name!,
      description: v.description,
      isRequired: v.isRequired,
      isSecret: v.isSecret,
      default: v.default,
    }));
}

function mapPackageArgs(args: RegistryArgDef[] | undefined): McpRegistryArg[] {
  const result: McpRegistryArg[] = [];
  for (const a of args ?? []) {
    if (a.type === "positional" || (!a.name && a.valueHint)) {
      result.push({
        name: a.valueHint ?? `arg${result.length + 1}`,
        description: a.description,
        isRequired: a.isRequired,
        default: a.default ?? a.value,
        type: "positional",
      });
      continue;
    }
    if (!a.name) continue;
    result.push({
      name: a.name,
      description: a.description,
      isRequired: a.isRequired,
      default: a.default,
      type: a.type,
    });
  }
  return result;
}

function buildStdioEntry(pkg: RegistryPackage): McpServerEntry {
  const runtime = pkg.runtimeHint ?? "npx";
  const version = pkg.version && pkg.version !== "latest" ? `@${pkg.version}` : "";
  const args: string[] = [];

  for (const arg of pkg.runtimeArguments ?? []) {
    if (arg.type === "positional" && arg.value) args.push(arg.value);
    else if (arg.name && arg.value) args.push(formatArgFlag(arg.name), arg.value);
    else if (arg.value) args.push(arg.value);
  }

  if (runtime === "npx" && !args.includes("-y")) args.push("-y");
  args.push(`${pkg.identifier}${version}`);

  for (const arg of pkg.packageArguments ?? []) {
    if (arg.type === "positional" && arg.value) args.push(arg.value);
    else if (arg.name && arg.default) args.push(formatArgFlag(arg.name), arg.default);
  }

  const entry: McpServerEntry = { command: runtime, args };
  const envVars = mapEnvVars(pkg.environmentVariables);
  const env: Record<string, string> = {};
  for (const v of envVars) {
    if (v.default) env[v.name] = v.default;
  }
  if (Object.keys(env).length > 0) entry["env"] = env;
  return entry;
}

function buildRemoteEntry(remote: RegistryRemote): McpServerEntry {
  return { url: remote.url! };
}

function summarizeServer(server: RegistryServerJson): McpRegistryServerItem | null {
  const stdioPkg = pickStdioPackage(server.packages);
  const remote = pickRemote(server.remotes);
  if (!stdioPkg && !remote) return null;

  return {
    id: server.name,
    title: server.title,
    description: server.description,
    version: server.version ?? "unknown",
    transport: stdioPkg ? "stdio" : "remote",
    websiteUrl: server.websiteUrl,
    repositoryUrl: server.repository?.url,
  };
}

function buildInstallPreview(server: RegistryServerJson, tool: string): McpRegistryInstallPreview | null {
  const stdioPkg = pickStdioPackage(server.packages);
  const remote = pickRemote(server.remotes);
  if (!stdioPkg && !remote) return null;

  let entry: McpServerEntry;
  let envVars: McpRegistryEnvVar[] = [];
  let packageArgs: McpRegistryArg[] = [];
  let transport: McpRegistryTransport;

  if (stdioPkg) {
    entry = buildStdioEntry(stdioPkg);
    envVars = mapEnvVars(stdioPkg.environmentVariables);
    packageArgs = mapPackageArgs(stdioPkg.packageArguments);
    transport = "stdio";
  } else {
    entry = buildRemoteEntry(remote!);
    transport = "remote";
  }

  return {
    registryId: server.name,
    suggestedName: registryNameToLocalName(server.name),
    title: server.title,
    description: server.description,
    transport,
    entry: adaptMcpEntry(entry, tool),
    envVars,
    packageArgs,
  };
}

async function fetchRegistryJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export { registryNameToLocalName };

/** List MCP servers from the official registry (search + cursor pagination). */
export async function listMcpRegistryServers(opts: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<McpRegistryListResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const params = new URLSearchParams({
    limit: String(limit),
    version: "latest",
  });
  if (opts.search?.trim()) params.set("search", opts.search.trim());
  if (opts.cursor) params.set("cursor", opts.cursor);

  try {
    const data = await fetchRegistryJson<RegistryListResponse>(
      `${REGISTRY_BASE}/servers?${params}`,
    );
    if (!data) return { servers: [], error: "Registry request failed" };

    const servers = (data.servers ?? [])
      .map((row) => (row.server ? summarizeServer(row.server) : null))
      .filter((s): s is McpRegistryServerItem => s !== null);

    return { servers, nextCursor: data.metadata?.nextCursor };
  } catch (err) {
    return { servers: [], error: errMsg(err) };
  }
}

/** Resolve a registry server into a tool-specific MCP install preview. */
export async function getMcpRegistryInstallPreview(
  registryId: string,
  tool: string,
  values?: { env?: Record<string, string>; packageArgs?: Record<string, string> },
): Promise<McpRegistryInstallPreview | { error: string }> {
  const encoded = encodeURIComponent(registryId);

  const data = await fetchRegistryJson<RegistryDetailResponse>(
    `${REGISTRY_BASE}/servers/${encoded}/versions/latest`,
  );
  if (!data?.server) return { error: "Server not found in registry" };

  const preview = buildInstallPreview(data.server, tool);
  if (!preview) return { error: "No installable stdio or remote transport found" };

  if (values?.env && Object.keys(values.env).length > 0) {
    const env = { ...(preview.entry["env"] as Record<string, string> | undefined) };
    for (const [k, v] of Object.entries(values.env)) {
      if (v.trim()) env[k] = v.trim();
    }
    preview.entry["env"] = env;
  }

  if (values?.packageArgs && preview.transport === "stdio" && Array.isArray(preview.entry["args"])) {
    const args = [...(preview.entry["args"] as string[])];
    for (const [name, value] of Object.entries(values.packageArgs)) {
      if (!value.trim()) continue;
      const meta = preview.packageArgs.find((a) => a.name === name);
      if (meta?.type === "positional") {
        args.push(value.trim());
        continue;
      }
      const flag = formatArgFlag(name);
      const idx = args.indexOf(flag);
      if (idx >= 0 && idx + 1 < args.length) {
        args[idx + 1] = value.trim();
      } else {
        args.push(flag, value.trim());
      }
    }
    preview.entry["args"] = args;
  }

  return preview;
}
