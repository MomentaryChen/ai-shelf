import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { claudeProjectDirMatches, isValidAgentSessionId } from "../shared/agent-session-resume.js";
import {
  ClaudeFullCollector,
  ClaudeHeadCollector,
  ClaudeSearchCollector,
  pickResumeCwd,
  searchTerms,
  sortByUpdated,
  textMatchesTerms,
  type ConversationDetail,
  type ConversationProviderId,
  type ConversationSearchHit,
  type ConversationSearchResult,
  type ConversationSummary,
} from "../shared/conversation-history.js";
import { claudeConfigDirForEnv } from "./agent-session.js";
import { readJsonlLines } from "./jsonl-line-reader.js";

/**
 * A source of past agent conversations. Only Claude Code is implemented; Codex /
 * Gemini sessions can join by implementing this interface and adding the provider
 * to `conversationProviders()`.
 */
export interface ConversationProvider {
  readonly id: ConversationProviderId;
  /** `refresh` re-checks cached facts that cost I/O outside the store (e.g. cwd existence). */
  listSessions(opts?: { refresh?: boolean }): Promise<ConversationSummary[]>;
  readSession(
    sessionId: string,
    opts?: { maxMessages?: number; maxMessageChars?: number },
  ): Promise<ConversationDetail | null>;
  searchSessions(
    query: string,
    opts: { limit: number; shouldStop: () => boolean },
  ): Promise<ConversationSearchResult>;
}

/** Head bytes read for a list row (the first prompt can sit behind large request records). */
const HEAD_MAX_BYTES = 4 * 1024 * 1024;
/** Concurrent file reads while scanning. */
const SCAN_CONCURRENCY = 8;

interface FileStamp {
  mtimeMs: number;
  size: number;
}

interface IndexedFile extends FileStamp {
  path: string;
  /** Folder name under `projects/`. */
  projectDir: string;
  sessionId: string;
}

interface HeadCacheEntry extends FileStamp {
  title: string;
  startedAt: number | null;
  gitBranch: string | null;
  cwds: string[];
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const sameStamp = (a: FileStamp | undefined, b: FileStamp) =>
  !!a && a.mtimeMs === b.mtimeMs && a.size === b.size;

async function dirExists(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

export class ClaudeConversationProvider implements ConversationProvider {
  readonly id = "claude" as const;
  private readonly heads = new Map<string, HeadCacheEntry>();
  /** Message counts from full reads (preview / search), keyed by path. */
  private readonly counts = new Map<string, FileStamp & { count: number }>();
  /** Last scanned files by session id (IPC passes ids, never paths). */
  private index = new Map<string, IndexedFile>();
  /**
   * Whether each session cwd exists. Cached because cwds can be network / WSL paths
   * that are slow to stat; cleared by an explicit refresh.
   */
  private readonly cwdExists = new Map<string, boolean>();

  constructor(
    private readonly configDir: () => string = () => claudeConfigDirForEnv(process.env),
  ) {}

  private caseInsensitive(): boolean {
    return process.platform === "win32" || process.platform === "darwin";
  }

  /** Every `<projects>/<folder>/<uuid>.jsonl` (no recursion into sub-agent folders). */
  private async scanFiles(): Promise<IndexedFile[]> {
    const projectsDir = join(this.configDir(), "projects");
    let folders: string[];
    try {
      folders = await readdir(projectsDir);
    } catch {
      return [];
    }
    const perFolder = await mapLimit(folders, SCAN_CONCURRENCY, async (folder) => {
      const dir = join(projectsDir, folder);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return [];
      }
      const files: IndexedFile[] = [];
      for (const name of names) {
        if (!name.endsWith(".jsonl")) continue;
        const sessionId = name.slice(0, -".jsonl".length);
        if (!isValidAgentSessionId(sessionId)) continue;
        const path = join(dir, name);
        try {
          const st = await stat(path);
          if (!st.isFile()) continue;
          files.push({ path, projectDir: folder, sessionId, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          /* vanished between readdir and stat */
        }
      }
      return files;
    });
    const files = perFolder.flat();
    const index = new Map<string, IndexedFile>();
    for (const f of files) {
      const prev = index.get(f.sessionId);
      if (!prev || f.mtimeMs > prev.mtimeMs) index.set(f.sessionId, f);
    }
    this.index = index;
    return [...index.values()];
  }

  private async readHead(file: IndexedFile): Promise<HeadCacheEntry> {
    const cached = this.heads.get(file.path);
    if (cached && sameStamp(cached, file)) return cached;
    const head = new ClaudeHeadCollector();
    for await (const line of readJsonlLines(file.path, {
      maxBytes: HEAD_MAX_BYTES,
      shouldStop: () => head.done,
    })) {
      head.add(line);
      if (head.done) break;
    }
    const entry: HeadCacheEntry = {
      mtimeMs: file.mtimeMs,
      size: file.size,
      title: head.title ?? head.fallbackTitle,
      startedAt: head.startedAt,
      gitBranch: head.gitBranch,
      cwds: head.cwds,
    };
    this.heads.set(file.path, entry);
    return entry;
  }

  private toSummary(
    file: IndexedFile,
    head: HeadCacheEntry,
    cwdExists: Map<string, boolean>,
  ): ConversationSummary {
    const ci = this.caseInsensitive();
    const pick = pickResumeCwd(head.cwds, (cwd) =>
      claudeProjectDirMatches(file.projectDir, cwd, ci),
    );
    const count = this.counts.get(file.path);
    return {
      provider: "claude",
      tool: "claude",
      sessionId: file.sessionId,
      cwd: pick.cwd,
      title: head.title,
      startedAt: head.startedAt,
      updatedAt: file.mtimeMs,
      messageCount: count && sameStamp(count, file) ? count.count : null,
      gitBranch: head.gitBranch,
      sizeBytes: file.size,
      resumable: !!pick.cwd && pick.matchesFolder && cwdExists.get(pick.cwd) === true,
    };
  }

  private async summarize(files: IndexedFile[]): Promise<ConversationSummary[]> {
    const heads = await mapLimit(files, SCAN_CONCURRENCY, (f) => this.readHead(f));
    const ci = this.caseInsensitive();
    const cwds = new Set<string>();
    files.forEach((f, i) => {
      const pick = pickResumeCwd(heads[i]?.cwds ?? [], (cwd) =>
        claudeProjectDirMatches(f.projectDir, cwd, ci),
      );
      if (pick.cwd) cwds.add(pick.cwd);
    });
    const unknown = [...cwds].filter((c) => !this.cwdExists.has(c));
    const exists = await mapLimit(unknown, SCAN_CONCURRENCY, dirExists);
    unknown.forEach((c, i) => this.cwdExists.set(c, exists[i]));
    const cwdExists = this.cwdExists;
    // Drop files whose head has no conversation at all (e.g. only bookkeeping records).
    return files
      .map((f, i) => ({ f, h: heads[i] }))
      .filter(({ h }) => h.title || h.cwds.length > 0)
      .map(({ f, h }) => this.toSummary(f, h, cwdExists));
  }

  async listSessions(opts: { refresh?: boolean } = {}): Promise<ConversationSummary[]> {
    if (opts.refresh) this.cwdExists.clear();
    const files = await this.scanFiles();
    // Forget cache entries for deleted files.
    const live = new Set(files.map((f) => f.path));
    for (const key of this.heads.keys()) if (!live.has(key)) this.heads.delete(key);
    for (const key of this.counts.keys()) if (!live.has(key)) this.counts.delete(key);
    return sortByUpdated(await this.summarize(files));
  }

  private async fileFor(sessionId: string): Promise<IndexedFile | null> {
    if (!isValidAgentSessionId(sessionId)) return null;
    let file = this.index.get(sessionId);
    if (!file) {
      await this.scanFiles();
      file = this.index.get(sessionId);
    }
    if (!file) return null;
    try {
      const st = await stat(file.path);
      return { ...file, mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      return null;
    }
  }

  async readSession(
    sessionId: string,
    opts: { maxMessages?: number; maxMessageChars?: number } = {},
  ): Promise<ConversationDetail | null> {
    const file = await this.fileFor(sessionId);
    if (!file) return null;
    const full = new ClaudeFullCollector({
      maxMessages: opts.maxMessages ?? 400,
      maxMessageChars: opts.maxMessageChars ?? 4000,
    });
    for await (const line of readJsonlLines(file.path)) full.add(line);
    this.counts.set(file.path, {
      mtimeMs: file.mtimeMs,
      size: file.size,
      count: full.messageCount,
    });
    const summary = (await this.summarize([file])).at(0);
    if (!summary) return null;
    return {
      summary: {
        ...summary,
        messageCount: full.messageCount,
        gitBranch: full.lastGitBranch ?? summary.gitBranch,
      },
      messages: full.messages,
      truncated: full.truncated,
    };
  }

  async searchSessions(
    query: string,
    opts: { limit: number; shouldStop: () => boolean },
  ): Promise<ConversationSearchResult> {
    const terms = searchTerms(query);
    if (terms.length === 0) return { hits: [], limited: false };
    const summaries = await this.listSessions();
    const hits: ConversationSearchHit[] = [];
    let limited = false;
    // Newest first, a few files at a time, stopping at the cap.
    for (let i = 0; i < summaries.length; i += SCAN_CONCURRENCY) {
      if (opts.shouldStop()) return { hits, limited, cancelled: true };
      if (hits.length >= opts.limit) {
        limited = true;
        break;
      }
      const batch = summaries.slice(i, i + SCAN_CONCURRENCY);
      const found = await Promise.all(batch.map((s) => this.searchOne(s, terms, opts.shouldStop)));
      for (const hit of found) {
        if (!hit) continue;
        if (hits.length >= opts.limit) {
          limited = true;
          break;
        }
        hits.push(hit);
      }
    }
    if (opts.shouldStop()) return { hits, limited, cancelled: true };
    return { hits, limited };
  }

  private async searchOne(
    summary: ConversationSummary,
    terms: string[],
    shouldStop: () => boolean,
  ): Promise<ConversationSearchHit | null> {
    const file = this.index.get(summary.sessionId);
    if (!file) return null;
    const col = new ClaudeSearchCollector(terms);
    for await (const line of readJsonlLines(file.path, { shouldStop })) col.add(line);
    if (shouldStop()) return null;
    if (col.snippet !== null) {
      return { summary, snippet: col.snippet, role: col.role, matchCount: col.matchCount };
    }
    // Title / cwd / branch matches still count (e.g. searching a project name).
    const meta = `${summary.title} ${summary.cwd ?? ""} ${summary.gitBranch ?? ""}`;
    if (textMatchesTerms(meta, terms)) {
      return {
        summary,
        snippet: summary.title || basename(summary.cwd ?? ""),
        role: "user",
        matchCount: 0,
      };
    }
    return null;
  }
}

let providers: ConversationProvider[] | null = null;

/** All registered conversation providers (singletons so caches survive between calls). */
export function conversationProviders(): ConversationProvider[] {
  providers ??= [new ClaudeConversationProvider()];
  return providers;
}

export function conversationProvider(id: unknown): ConversationProvider | null {
  return conversationProviders().find((p) => p.id === id) ?? null;
}
