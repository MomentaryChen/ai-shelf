import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

/** Windows drive / UNC, Unix absolute, and file:// URLs in shell output. */
const PATH_PATTERN =
  /(?:file:\/\/[^\s"'<>|`]+|(?:[A-Za-z]:[\\/]|\\\\)(?:[^\s"'<>|`\\]+[\\/])*[^\s"'<>|`\\.,;:!?)]*|\/(?:[^\s/\\]+(?:\/[^\s/\\]+)*))/gi;

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

class PathLinkProvider implements ILinkProvider {
  constructor(private readonly terminal: Terminal) {}

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
    const links: ILink[] = [];
    const re = new RegExp(PATH_PATTERN.source, PATH_PATTERN.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const normalized = normalizePathForOpen(raw);
      if (!isPlausiblePath(normalized)) continue;

      const start = match.index;
      const end = start + raw.length;
      const y = bufferLineNumber + 1;

      links.push({
        text: raw,
        range: {
          start: { x: start + 1, y },
          end: { x: end + 1, y },
        },
        activate: (event, linkText) => {
          if (!linkModifierPressed(event)) return;
          void window.api.openPath(normalizePathForOpen(linkText));
        },
      });
    }

    callback(links.length > 0 ? links : undefined);
  }
}

/**
 * Clickable paths (Ctrl/Cmd+click → openPath) and URLs (→ openExternal).
 * OSC 8 hyperlinks use the same handlers via terminal.options.linkHandler.
 */
export function bindTerminalLinks(term: Terminal): () => void {
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

  const pathLinks = term.registerLinkProvider(new PathLinkProvider(term));
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
