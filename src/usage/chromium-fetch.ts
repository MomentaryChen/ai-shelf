/** Use Chromium network stack (Electron net.fetch) to avoid Cloudflare TLS blocks on claude.ai. */
let cached: typeof fetch | null = null;

export async function chromiumFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!cached) {
    try {
      const { net, session } = await import("electron");
      cached = ((url: RequestInfo | URL, options?: RequestInit) => {
        const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url;
        return net.fetch(target, {
          ...options,
          session: session.defaultSession,
        } as Parameters<typeof net.fetch>[1]);
      }) as typeof fetch;
    } catch {
      cached = fetch;
    }
  }
  return cached(input, init);
}
