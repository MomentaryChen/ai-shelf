import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

let server: Server | null = null;
let baseUrl: string | null = null;

/** Stable origin so Firebase Auth persistence (IndexedDB) survives app restarts. */
const DEFAULT_RENDERER_PORT = 47_832;

function resolveRendererPort(): number {
  const raw = process.env.AI_SHELF_RENDERER_PORT?.trim();
  if (!raw) return DEFAULT_RENDERER_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid AI_SHELF_RENDERER_PORT: ${raw}`);
  }
  return port;
}

/**
 * Serve the built renderer over http://localhost so Firebase Auth (Google OAuth)
 * has a valid http(s) origin. file:// triggers auth/internal-error.
 */
export async function startRendererServer(rendererRoot: string): Promise<string> {
  if (baseUrl) return baseUrl;

  const root = normalize(rendererRoot);

  server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      if (pathname === "/") pathname = "/index.html";

      const filePath = normalize(join(root, pathname));
      if (!filePath.startsWith(root)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const relative = filePath.slice(root.length);
      const isAuthHandler = relative.startsWith("/__/auth/");
      const exists = existsSync(filePath);

      if (!exists && !isAuthHandler) {
        res.writeHead(404);
        res.end();
        return;
      }

      const servePath = exists ? filePath : join(root, "index.html");
      const body = await readFile(servePath);
      const type = MIME[extname(servePath)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    const port = resolveRendererPort();
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to start renderer HTTP server");
  }

  // Use localhost hostname — matches Firebase default authorized domain.
  baseUrl = `http://localhost:${addr.port}`;
  return baseUrl;
}

export function getRendererPageUrl(hash?: string): string {
  if (!baseUrl) throw new Error("Renderer server not started");
  if (!hash) return `${baseUrl}/index.html`;
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  return `${baseUrl}/index.html${normalized}`;
}

export function stopRendererServer(): void {
  server?.close();
  server = null;
  baseUrl = null;
}
