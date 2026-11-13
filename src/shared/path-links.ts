/**
 * Find file paths in one line of terminal output, with optional line / column
 * suffixes, and resolve relative ones against the pane's cwd.
 *
 * Pure (no DOM / Electron / node:path) so the renderer link provider and the
 * main-process opener share it and it runs under plain `tsx --test`.
 *
 * Recognised forms:
 *   C:\src\a.ts   \\server\share\a.ts   /home/me/a.ts   file:///C:/a.ts
 *   src/foo.ts    ./a/b.tsx   ../x.py   foo.py
 * each optionally followed by `:12`, `:12:5`, `(12)` or `(12,5)`.
 */

export interface PathLinkMatch {
  /** Start index of the link text in the line (UTF-16 index). */
  start: number;
  /** End index (exclusive) — covers the path and its line/col suffix. */
  end: number;
  /** Path as written (file:// URLs decoded), without the line/col suffix. */
  path: string;
  line?: number;
  col?: number;
  /** Absolute paths are linked as-is; relative ones need a cwd + existence check. */
  absolute: boolean;
}

/** Whitespace-free runs that could hold a path; quotes and pipes split them. */
const TOKEN_RE = /[^\s"'`<>|]+/g;
/** Wrapping characters to peel off the front of a token. */
const LEADING_JUNK = /^[([{<=,;]+/;
/** Sentence punctuation after a path (`see src/a.ts.` / `(src/a.ts)`). */
const TRAILING_JUNK = /[.,;:!?\]}>]+$/;
/** `:12`, `:12:5`, `(12)`, `(12,5)` at the end of the token. */
const SUFFIX_RE = /(?::(\d+)(?::(\d+))?|\((\d+)(?:,(\d+))?\))$/;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const WINDOWS_ABS_RE = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/])/;
/** Relative path ending in `name.ext` (ext starts with a letter: skips `1.2`). */
const RELATIVE_FILE_RE = /^(?:[\w@+-][\w@.+-]*[\\/])*[\w@+-][\w@.+-]*\.[A-Za-z][A-Za-z0-9]{0,9}$/;
/** `./x` and `../x` are always path-like, even without an extension. */
const DOT_RELATIVE_RE = /^\.\.?[\\/][\w@.+\\/-]*$/;

function toPositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Strip trailing punctuation, keeping a `(12)` suffix and balanced parentheses. */
function trimTrailing(token: string): string {
  let t = token;
  for (;;) {
    const before = t;
    t = t.replace(TRAILING_JUNK, "");
    if (t.endsWith(")") && !/\(\d+(?:,\d+)?\)$/.test(t)) {
      const opens = (t.match(/\(/g) ?? []).length;
      const closes = (t.match(/\)/g) ?? []).length;
      if (closes > opens) t = t.slice(0, -1);
    }
    if (t === before) return t;
  }
}

function decodeFileUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    let p = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    if (u.host) p = `\\\\${u.host}${p.replace(/\//g, "\\")}`;
    return p || null;
  } catch {
    return null;
  }
}

interface Classified {
  path: string;
  absolute: boolean;
}

function classify(body: string): Classified | null {
  if (/^file:\/\//i.test(body)) {
    const p = decodeFileUrl(body);
    return p ? { path: p, absolute: true } : null;
  }
  if (URL_SCHEME_RE.test(body)) return null; // http(s) etc. — web-links addon
  if (WINDOWS_ABS_RE.test(body)) return body.length >= 4 ? { path: body, absolute: true } : null;
  if (body.startsWith("/")) {
    if (body.startsWith("//") || body.length < 2) return null;
    return { path: body, absolute: true };
  }
  if (body.includes(":")) return null; // `key:value`, `scheme:`, drive-less colons
  if (DOT_RELATIVE_RE.test(body) && body.length > 2) return { path: body, absolute: false };
  if (RELATIVE_FILE_RE.test(body)) return { path: body, absolute: false };
  return null;
}

/** Parse one trimmed token (path + optional suffix) starting at `start`. */
function matchToken(token: string, start: number): PathLinkMatch | null {
  let body = token;
  let line: number | undefined;
  let col: number | undefined;
  const suffix = SUFFIX_RE.exec(token);
  if (suffix && suffix.index > 0) {
    const l = toPositiveInt(suffix[1] ?? suffix[3]);
    if (l !== undefined) {
      body = token.slice(0, suffix.index);
      line = l;
      col = toPositiveInt(suffix[2] ?? suffix[4]);
    }
  }
  body = trimTrailing(body);
  const hit = classify(body);
  if (!hit) return null;
  const match: PathLinkMatch = {
    start,
    end: start + token.length,
    path: hit.path,
    absolute: hit.absolute,
  };
  if (line !== undefined) match.line = line;
  if (line !== undefined && col !== undefined) match.col = col;
  return match;
}

/** `name:` before an absolute path (`cwd:C:\proj`, `at:/x`); one-letter = drive. */
const LABEL_PREFIX_RE = /^[A-Za-z][\w-]+:(?=[A-Za-z]:[\\/]|\/[^/]|\\\\)/;

/**
 * Where a path may start inside a token that is not a path itself:
 * after the last `=` (`--out=C:\dist\a.js`) or a `label:` prefix.
 */
function innerOffsets(token: string): number[] {
  const offsets: number[] = [];
  const eq = token.lastIndexOf("=");
  if (eq >= 0 && eq < token.length - 1) offsets.push(eq + 1);
  const label = LABEL_PREFIX_RE.exec(token);
  if (label) offsets.push(label[0].length);
  return offsets;
}

/** Path links in `text`, left to right. */
export function findPathLinks(text: string): PathLinkMatch[] {
  const out: PathLinkMatch[] = [];
  const re = new RegExp(TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let token = m[0];
    let start = m.index;
    const lead = LEADING_JUNK.exec(token);
    if (lead) {
      token = token.slice(lead[0].length);
      start += lead[0].length;
    }
    token = trimTrailing(token);
    if (!token) continue;

    let match = matchToken(token, start);
    if (!match) {
      for (const offset of innerOffsets(token)) {
        match = matchToken(token.slice(offset), start + offset);
        if (match) break;
      }
    }
    if (match) out.push(match);
  }
  return out;
}

function isWindowsStyle(p: string): boolean {
  return WINDOWS_ABS_RE.test(p) || (p.includes("\\") && !p.startsWith("/"));
}

/**
 * Join a relative path onto `cwd` and collapse `.` / `..`. Separators follow
 * the cwd's style. Returns `null` without a usable absolute cwd, or when `..`
 * would climb above the root.
 */
export function resolveRelativePath(cwd: string | undefined, rel: string): string | null {
  const base = (cwd ?? "").trim();
  if (!base || !rel) return null;
  const windows = isWindowsStyle(base);
  let root: string;
  let restOfBase: string;
  if (windows) {
    const drive = /^([A-Za-z]:)[\\/]?/.exec(base);
    const unc = /^\\\\[^\\/]+[\\/][^\\/]+/.exec(base);
    if (drive) {
      root = `${drive[1]}\\`;
      restOfBase = base.slice(drive[0].length);
    } else if (unc) {
      root = `${unc[0].replace(/\//g, "\\")}\\`;
      restOfBase = base.slice(unc[0].length);
    } else {
      return null;
    }
  } else {
    if (!base.startsWith("/")) return null;
    root = "/";
    restOfBase = base.slice(1);
  }
  const segments: string[] = [];
  for (const part of `${restOfBase}/${rel}`.split(/[\\/]+/)) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return root + segments.join(windows ? "\\" : "/");
}

/** `path:line:col` for `code -g`. */
export function gotoTarget(path: string, line?: number, col?: number): string {
  if (!line) return path;
  return col ? `${path}:${line}:${col}` : `${path}:${line}`;
}

/** `vscode://file/<path>:line:col` — same as `code -g`, without a shell. */
export function vscodeFileUrl(path: string, line?: number, col?: number): string {
  let p = path.replace(/\\/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  const encoded = encodeURI(p).replace(/#/g, "%23").replace(/\?/g, "%3F");
  return `vscode://file${gotoTarget(encoded, line, col)}`;
}
