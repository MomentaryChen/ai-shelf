/**
 * Lightweight wrapper around Node's native fetch with timeout support.
 */
export async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 8_000
): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
