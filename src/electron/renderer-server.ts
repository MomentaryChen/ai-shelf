import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { app } from "electron";

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

/** Packaged app: stable origin for Firebase Auth persistence (IndexedDB). */
const PROD_RENDERER_PORT = 47_832;
/** Dev default — avoids colliding with an installed / other dev instance on 47832. */
const DEV_RENDERER_PORT = 47_833;

function resolveRendererPort(): number {
  const raw = process.env.AI_SHELF_RENDERER_PORT?.trim();
  if (raw) {
    const port = Number(raw);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new Error(`Invalid AI_SHELF_RENDERER_PORT: ${raw}`);
    }
    return port;
  }
  return app.isPackaged ? PROD_RENDERER_PORT : DEV_RENDERER_PORT;
}

function listenOnPort(httpServer: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      httpServer.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port, "127.0.0.1");
  });
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

  const preferred = resolveRendererPort();
  try {
    await listenOnPort(server, preferred);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (!app.isPackaged && code === "EADDRINUSE") {
      console.warn(
        `[renderer-server] Port ${preferred} in use — dev mode falling back to an ephemeral port`,
      );
      await listenOnPort(server, 0);
    } else {
      throw err;
    }
  }

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to start renderer HTTP server");
  }

  if (!app.isPackaged) {
    console.info(`[renderer-server] Dev renderer at http://localhost:${addr.port}`);
  }

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
