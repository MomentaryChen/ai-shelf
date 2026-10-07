/**
 * Windows ↔ WSL path conversion and `wsl -l -v` parsing.
 * Pure helpers — used by the WSL Tools panel (renderer + main) and unit tests.
 */

export type WslPathKind = "win-drive" | "win-unc" | "wsl-mnt" | "linux" | "unknown";

export type WslConvertDirection = "auto" | "to-wsl" | "to-windows";

export type WslWindowsStyle = "drive" | "unc";

export type WslConvertOk = {
  ok: true;
  result: string;
  kind: WslPathKind;
  direction: "to-wsl" | "to-windows";
};

export type WslConvertErr = {
  ok: false;
  reason: "empty" | "unknown" | "needs-distro" | "unsupported";
};

export type WslConvertResult = WslConvertOk | WslConvertErr;

export type WslDistro = {
  name: string;
  state: string;
  version: string;
  isDefault: boolean;
};

export type WslConvertOptions = {
  direction?: WslConvertDirection;
  distro?: string;
  windowsStyle?: WslWindowsStyle;
};

const DRIVE_RE = /^([A-Za-z]):([\\/].*)?$/u;
const UNC_RE = /^\\\\(wsl\$|wsl\.localhost)\\([^\\/]+)(.*)$/iu;
const MNT_RE = /^\/mnt\/([a-zA-Z])(\/.*)?$/u;

export function normalizeDistroName(name: string): string {
  return name.trim();
}

export function detectWslPathKind(input: string): WslPathKind {
  const trimmed = input.trim().replace(/^["']|["']$/gu, "");
  if (!trimmed) return "unknown";
  if (UNC_RE.test(trimmed)) return "win-unc";
  if (DRIVE_RE.test(trimmed)) return "win-drive";
  if (MNT_RE.test(trimmed)) return "wsl-mnt";
  if (trimmed.startsWith("/")) return "linux";
  return "unknown";
}

function stripQuotes(input: string): string {
  const trimmed = input.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function toPosixSeparators(path: string): string {
  return path.replace(/\\/gu, "/");
}

function toWindowsSeparators(path: string): string {
  return path.replace(/\//gu, "\\");
}

function winDriveToWsl(path: string): string | null {
  const m = path.match(DRIVE_RE);
  if (!m) return null;
  const drive = m[1]!.toLowerCase();
  const rest = toPosixSeparators(m[2] ?? "");
  if (!rest || rest === "/") return `/mnt/${drive}`;
  return `/mnt/${drive}${rest}`;
}

function wslMntToWinDrive(path: string): string | null {
  const m = path.match(MNT_RE);
  if (!m) return null;
  const drive = m[1]!.toUpperCase();
  const rest = m[2] ?? "";
  if (!rest || rest === "/") return `${drive}:\\`;
  return `${drive}:${toWindowsSeparators(rest)}`;
}

function winUncToLinux(path: string): { distro: string; linux: string } | null {
  const m = path.match(UNC_RE);
  if (!m) return null;
  const distro = m[2]!;
  const rest = toPosixSeparators(m[3] ?? "");
  if (!rest || rest === "/") return { distro, linux: "/" };
  return { distro, linux: rest.startsWith("/") ? rest : `/${rest}` };
}

function linuxToWinUnc(path: string, distro: string): string | null {
  const name = normalizeDistroName(distro);
  if (!name) return null;
  const posix = path.startsWith("/") ? path : `/${path}`;
  if (posix === "/") return `\\\\wsl$\\${name}\\`;
  return `\\\\wsl$\\${name}${toWindowsSeparators(posix)}`;
}

function resolveDirection(
  kind: WslPathKind,
  direction: WslConvertDirection,
): "to-wsl" | "to-windows" | null {
  if (direction === "to-wsl") return "to-wsl";
  if (direction === "to-windows") return "to-windows";
  if (kind === "win-drive" || kind === "win-unc") return "to-wsl";
  if (kind === "wsl-mnt" || kind === "linux") return "to-windows";
  return null;
}

/** Convert a single path. Empty / unknown inputs return structured errors. */
export function convertWslPath(input: string, options: WslConvertOptions = {}): WslConvertResult {
  const path = stripQuotes(input);
  if (!path) return { ok: false, reason: "empty" };

  const kind = detectWslPathKind(path);
  if (kind === "unknown") return { ok: false, reason: "unknown" };

  const direction = resolveDirection(kind, options.direction ?? "auto");
  if (!direction) return { ok: false, reason: "unknown" };

  const distro = normalizeDistroName(options.distro ?? "");
  const windowsStyle = options.windowsStyle ?? "drive";

  if (direction === "to-wsl") {
    if (kind === "win-drive") {
      const result = winDriveToWsl(path);
      return result ? { ok: true, result, kind, direction } : { ok: false, reason: "unsupported" };
    }
    if (kind === "win-unc") {
      const parsed = winUncToLinux(path);
      return parsed
        ? { ok: true, result: parsed.linux, kind, direction }
        : { ok: false, reason: "unsupported" };
    }
    if (kind === "wsl-mnt" || kind === "linux") {
      // Already a Linux path — keep as-is when forcing to-wsl.
      return { ok: true, result: path, kind, direction };
    }
    return { ok: false, reason: "unsupported" };
  }

  // to-windows
  if (kind === "wsl-mnt") {
    if (windowsStyle === "unc") {
      if (!distro) return { ok: false, reason: "needs-distro" };
      const result = linuxToWinUnc(path, distro);
      return result ? { ok: true, result, kind, direction } : { ok: false, reason: "unsupported" };
    }
    const result = wslMntToWinDrive(path);
    return result ? { ok: true, result, kind, direction } : { ok: false, reason: "unsupported" };
  }

  if (kind === "linux") {
    if (!distro) return { ok: false, reason: "needs-distro" };
    const result = linuxToWinUnc(path, distro);
    return result ? { ok: true, result, kind, direction } : { ok: false, reason: "unsupported" };
  }

  if (kind === "win-drive" || kind === "win-unc") {
    // Already Windows — keep as-is when forcing to-windows.
    return { ok: true, result: path, kind, direction };
  }

  return { ok: false, reason: "unsupported" };
}

/** Convert each non-empty line; blank lines are preserved. */
export function convertWslPaths(
  input: string,
  options: WslConvertOptions = {},
): { lines: string[]; errors: Array<{ line: number; reason: WslConvertErr["reason"] }> } {
  const rawLines = input.split(/\r?\n/u);
  const errors: Array<{ line: number; reason: WslConvertErr["reason"] }> = [];
  const lines = rawLines.map((line, index) => {
    if (!line.trim()) return line;
    const result = convertWslPath(line, options);
    if (result.ok) return result.result;
    errors.push({ line: index + 1, reason: result.reason });
    return line;
  });
  return { lines, errors };
}

/**
 * Decode `wsl.exe -l -v` stdout. WSL often emits UTF-16LE (with or without BOM);
 * newer builds may honor `--utf8`.
 */
export function decodeWslListOutput(buf: Buffer | string): string {
  if (typeof buf === "string") {
    return buf.replace(/^\uFEFF/u, "").replace(/\0/gu, "");
  }
  if (buf.length >= 2) {
    const bomLe = buf[0] === 0xff && buf[1] === 0xfe;
    const bomBe = buf[0] === 0xfe && buf[1] === 0xff;
    const looksUtf16Le =
      bomLe || (!bomBe && buf.length >= 4 && buf[1] === 0 && buf[3] === 0);
    if (looksUtf16Le) {
      const start = bomLe ? 2 : 0;
      return buf.toString("utf16le", start).replace(/\0/gu, "");
    }
    if (bomBe) {
      // Rare; swap to LE then decode.
      const swapped = Buffer.alloc(buf.length - 2);
      for (let i = 2; i + 1 < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1]!;
        swapped[i - 1] = buf[i]!;
      }
      return swapped.toString("utf16le").replace(/\0/gu, "");
    }
  }
  return buf.toString("utf8").replace(/^\uFEFF/u, "").replace(/\0/gu, "");
}

/** Parse `wsl -l -v` (or `--utf8`) textual table into distro rows. */
export function parseWslListVerbose(text: string): WslDistro[] {
  const cleaned = decodeWslListOutput(text);
  const lines = cleaned
    .split(/\r?\n/u)
    .map((line) => line.replace(/\u0000/gu, "").trimEnd())
    .filter((line) => line.trim().length > 0);

  const distros: WslDistro[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^NAME\b/iu.test(trimmed)) continue;
    if (/^Windows Subsystem/iu.test(trimmed)) continue;
    if (/^The Windows Subsystem/iu.test(trimmed)) continue;

    const isDefault = trimmed.startsWith("*");
    const body = isDefault ? trimmed.slice(1).trim() : trimmed;
    // Columns: NAME  STATE  VERSION — name may contain spaces rarely; split on 2+ spaces.
    const parts = body.split(/\s{2,}/u).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      // Fallback: whitespace split when columns are single-spaced.
      const loose = body.split(/\s+/u).filter(Boolean);
      if (loose.length < 2) continue;
      const version = /^\d+$/u.test(loose[loose.length - 1]!) ? loose.pop()! : "";
      const state = loose.pop()!;
      const name = loose.join(" ");
      if (!name) continue;
      distros.push({ name, state, version, isDefault });
      continue;
    }

    const name = parts[0]!;
    const state = parts[1] ?? "";
    const version = parts[2] ?? "";
    distros.push({ name, state, version, isDefault });
  }
  return distros;
}

/** Build everyday WSL helper commands from a path + distro. */
export function buildWslSnippets(opts: {
  path: string;
  distro: string;
}): Array<{ id: string; command: string }> {
  const distro = normalizeDistroName(opts.distro) || "Ubuntu";
  const path = stripQuotes(opts.path);
  const kind = detectWslPathKind(path);
  const toWsl = convertWslPath(path, { direction: "to-wsl", distro });
  const linuxPath = toWsl.ok ? toWsl.result : kind === "linux" || kind === "wsl-mnt" ? path : "";
  const toWin = convertWslPath(path, { direction: "to-windows", distro, windowsStyle: "drive" });
  const winPath = toWin.ok ? toWin.result : kind === "win-drive" || kind === "win-unc" ? path : "";

  const snippets: Array<{ id: string; command: string }> = [];

  if (linuxPath) {
    const quoted = linuxPath.includes(" ") ? `"${linuxPath}"` : linuxPath;
    snippets.push({
      id: "shell",
      command: `wsl.exe -d ${distro} --cd ${quoted}`,
    });
    snippets.push({
      id: "bash",
      command: `wsl.exe -d ${distro} --cd ${quoted} -- bash -lc "exec bash"`,
    });
  }

  if (winPath) {
    const escaped = winPath.replace(/"/gu, '\\"');
    snippets.push({
      id: "explorer",
      command: `explorer.exe "${escaped}"`,
    });
    snippets.push({
      id: "wslpath",
      command: `wsl.exe -d ${distro} -- wslpath -w ${linuxPath ? (linuxPath.includes(" ") ? `"${linuxPath}"` : linuxPath) : "."}`,
    });
  }

  if (linuxPath) {
    snippets.push({
      id: "code",
      command: `wsl.exe -d ${distro} --cd ${linuxPath.includes(" ") ? `"${linuxPath}"` : linuxPath} -- code .`,
    });
  }

  snippets.push({
    id: "ip",
    command: `wsl.exe -d ${distro} -- hostname -I`,
  });

  return snippets;
}
