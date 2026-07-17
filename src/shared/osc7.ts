/**
 * Parse an OSC 7 payload (the data between `ESC ] 7 ;` and `BEL` / `ST`)
 * into a filesystem path. Used by the renderer xterm handler.
 *
 * Common forms:
 * - `file:///C:/Users/foo` (Windows drive)
 * - `file://hostname/home/foo` (Unix; hostname ignored)
 * - `file://server/share/foo` (Windows UNC)
 * - plain `/home/foo` or `C:\Users\foo`
 */

export type Osc7Platform = "win32" | "darwin" | "linux" | string;

export function parseOsc7Payload(
  data: string,
  platform: Osc7Platform = "linux",
): string | null {
  const raw = data.trim();
  if (!raw) return null;

  if (/^file:/i.test(raw)) {
    return fileUrlToPath(raw, platform);
  }

  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
    return normalizeSeparators(raw, platform);
  }

  return null;
}

function fileUrlToPath(uri: string, platform: Osc7Platform): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "file:") return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const host = url.hostname;
  const isWin = platform === "win32";

  // Windows drive path: file:///C:/Users/... → pathname "/C:/Users/..."
  if (/^\/[A-Za-z]:/.test(pathname)) {
    return normalizeSeparators(pathname.slice(1), platform);
  }

  if (host && host !== "localhost" && host !== "127.0.0.1") {
    // Windows UNC: file://server/share/path
    if (isWin) {
      const rest = pathname.replace(/^\//, "").replace(/\//g, "\\");
      if (!rest) return null;
      return `\\\\${host}\\${rest}`;
    }
    // Unix OSC 7: file://hostname/home/user — hostname is the machine, path is absolute
    if (pathname.startsWith("/")) {
      return pathname;
    }
    return null;
  }

  if (!pathname) return null;

  // file:///home/user → /home/user
  if (pathname.startsWith("/")) {
    return isWin ? normalizeSeparators(pathname, platform) : pathname;
  }

  return normalizeSeparators(pathname, platform);
}

function normalizeSeparators(path: string, platform: Osc7Platform): string {
  if (platform === "win32") {
    return path.replace(/\//g, "\\");
  }
  return path.replace(/\\/g, "/");
}
