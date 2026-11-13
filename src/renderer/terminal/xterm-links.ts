import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import {
  findPathLinks,
  resolveRelativePath,
  type PathLinkMatch,
} from "../../shared/path-links.js";

function linkModifierPressed(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function trimLinkPath(text: string): string {
  let p = text.trim();
  if (
    (p.startsWith('"') && p.endsWith('"')) ||
    (p.startsWith("'") && p.endsWith("'"))
  ) {
    p = p.slice(1, -1);
  }
  return p.replace(/[,;:!?.)]+$/g, "");
}

function normalizePathForOpen(raw: string): string {
  let p = trimLinkPath(raw);
  if (/^file:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      p = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    } catch {
      p = p.replace(/^file:\/\/\/?/i, "");
    }
  }
  return p;
}

function isPlausiblePath(path: string): boolean {
  if (/^file:\/\//i.test(path)) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return path.length >= 4;
  if (path.startsWith("\\\\")) return path.length >= 4;
  if (path.startsWith("/")) return path.length >= 2;
  return false;
}

/** Open a file, at a line when one was given (VS Code `-g` in main), else the OS handler. */
function openPathTarget(path: string, line?: number, col?: number): void {
  if (line && window.api.openPathAt) {
    void window.api.openPathAt({ path, line, col });
    return;
  }
  void window.api.openPath(path);
}

// ---------------------------------------------------------------------------
// Existence cache for relative links (one batched IPC per line)
// ---------------------------------------------------------------------------

const EXISTS_TTL_MS = 10_000;
const EXISTS_CACHE_MAX = 500;
/** Relative candidates checked per line; `paths-exist` caps the same. */
const MAX_RELATIVE_PER_LINE = 16;
const existsCache = new Map<string, { ok: boolean; at: number }>();

async function pathsExist(paths: string[]): Promise<Map<string, boolean>> {
  const now = Date.now();
  const result = new Map<string, boolean>();
  const missing: string[] = [];
  for (const p of paths) {
    const hit = existsCache.get(p);
    if (hit && now - hit.at < EXISTS_TTL_MS) result.set(p, hit.ok);
    else if (!missing.includes(p)) missing.push(p);
  }
  if (missing.length > 0 && window.api.pathsExist) {
    let flags: boolean[] = [];
    try {
      flags = await window.api.pathsExist(missing);
    } catch {
      flags = [];
    }
    if (existsCache.size > EXISTS_CACHE_MAX) existsCache.clear();
    missing.forEach((p, i) => {
      const ok = flags[i] === true;
      existsCache.set(p, { ok, at: now });
      result.set(p, ok);
    });
  }
  return result;
}

interface ResolvedLink {
  match: PathLinkMatch;
  /** Absolute path to open. */
  path: string;
}

class PathLinkProvider implements ILinkProvider {
  constructor(
    private readonly terminal: Terminal,
    private readonly getCwd: () => string | undefined,
  ) {}

  provideLinks(
    bufferLineNumber: number,
    callback: (links: ILink[] | undefined) => void,
  ): void {
    const line = this.terminal.buffer.active.getLine(bufferLineNumber);
    if (!line) {
      callback(undefined);
      return;
    }

    const text = line.translateToString(false);
    const absolute: ResolvedLink[] = [];
    const relative: ResolvedLink[] = [];
    const cwd = this.getCwd();
    for (const match of findPathLinks(text)) {
      if (match.absolute) {
        if (isPlausiblePath(match.path)) absolute.push({ match, path: match.path });
        continue;
      }
      if (relative.length >= MAX_RELATIVE_PER_LINE) continue;
      const resolved = resolveRelativePath(cwd, match.path);
      if (resolved) relative.push({ match, path: resolved });
    }

    const toLinks = (items: ResolvedLink[]): ILink[] | undefined => {
      if (items.length === 0) return undefined;
      const y = bufferLineNumber + 1;
      return items
        .sort((a, b) => a.match.start - b.match.start)
        .map(({ match, path }) => ({
          text: text.slice(match.start, match.end),
          range: {
            start: { x: match.start + 1, y },
            end: { x: match.end, y },
          },
          activate: (event: MouseEvent) => {
            if (!linkModifierPressed(event)) return;
            openPathTarget(path, match.line, match.col);
          },
        }));
    };

    if (relative.length === 0) {
      callback(toLinks(absolute));
      return;
    }
    // Only link relative paths that exist, so ordinary words are not underlined.
    void pathsExist(relative.map((r) => r.path)).then((exists) => {
      callback(toLinks([...absolute, ...relative.filter((r) => exists.get(r.path))]));
    });
  }
}

export interface TerminalLinkOptions {
  /** Pane cwd for relative paths (`src/foo.ts:42`); none = absolute paths only. */
  getCwd?: () => string | undefined;
}

/**
 * Clickable paths (Ctrl/Cmd+click → open, at `:line:col` in VS Code when given)
 * and URLs (→ openExternal). OSC 8 hyperlinks use the same handlers via
 * terminal.options.linkHandler.
 */
export function bindTerminalLinks(term: Terminal, options: TerminalLinkOptions = {}): () => void {
  const openHttp = (event: MouseEvent, uri: string) => {
    if (!linkModifierPressed(event)) return;
    void window.api.openExternal(uri);
  };

  const openPathOrUrl = (event: MouseEvent, text: string) => {
    if (!linkModifierPressed(event)) return;
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      void window.api.openExternal(trimmed);
      return;
    }
    const path = normalizePathForOpen(trimmed);
    if (isPlausiblePath(path)) void window.api.openPath(path);
  };

  const pathLinks = term.registerLinkProvider(
    new PathLinkProvider(term, options.getCwd ?? (() => undefined)),
  );
  const webLinks = new WebLinksAddon(openHttp);
  term.loadAddon(webLinks);

  term.options.linkHandler = {
    activate: openPathOrUrl,
    allowNonHttpProtocols: true,
  };

  return () => {
    pathLinks.dispose();
    webLinks.dispose();
    term.options.linkHandler = null;
  };
}
