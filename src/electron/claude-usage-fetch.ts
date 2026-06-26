import { BrowserWindow, session } from "electron";

export interface ClaudeBrowserCookies {
  sessionKey: string;
  lastActiveOrg?: string;
  cfClearance?: string;
}

const PARTITION = "persist:claude-usage-bridge";
const LOAD_TIMEOUT_MS = 45_000;

let gate: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn);
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function setCookies(ses: Electron.Session, cookies: ClaudeBrowserCookies): Promise<void> {
  const base = {
    url: "https://claude.ai",
    domain: ".claude.ai",
    path: "/",
    secure: true,
    sameSite: "no_restriction" as const,
  };

  await ses.cookies.set({
    ...base,
    name: "sessionKey",
    value: cookies.sessionKey,
    httpOnly: true,
  });

  if (cookies.lastActiveOrg) {
    await ses.cookies.set({
      ...base,
      name: "lastActiveOrg",
      value: cookies.lastActiveOrg,
      httpOnly: false,
    });
  }

  if (cookies.cfClearance) {
    await ses.cookies.set({
      ...base,
      name: "cf_clearance",
      value: cookies.cfClearance,
      httpOnly: false,
    });
  }
}

function sessionExpiredMessage(): string {
  return [
    "Claude session expired or invalid.",
    "Log in at claude.ai in your browser, copy a fresh sessionKey cookie, and save it here.",
    "You do not need cf_clearance — the app passes Cloudflare automatically.",
  ].join(" ");
}

function forbiddenMessage(): string {
  return [
    "Forbidden: claude.ai rejected the session.",
    "Copy a new sessionKey from DevTools while logged into claude.ai (Application → Cookies).",
    "Clear the Admin API key if you only use personal session.",
  ].join(" ");
}

/**
 * Load claude.ai in a hidden Chromium window (same TLS as a real browser), then call the API
 * with credentials: include so Cloudflare clearance is obtained in-process.
 */
export function fetchClaudeApiInBrowser(
  cookies: ClaudeBrowserCookies,
  apiPath: string,
): Promise<unknown> {
  return enqueue(async () => {
    const ses = session.fromPartition(PARTITION);
    await setCookies(ses, cookies);

    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 700,
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    try {
      await Promise.race([
        win.loadURL("https://claude.ai/settings/usage"),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out loading claude.ai")), LOAD_TIMEOUT_MS);
        }),
      ]);

      // Let Cloudflare / session cookies settle after navigation.
      await new Promise((r) => setTimeout(r, 2000));

      const href = String(await win.webContents.executeJavaScript("window.location.href", true));
      if (/login|auth/i.test(href)) {
        throw new Error(sessionExpiredMessage());
      }

      const result = (await win.webContents.executeJavaScript(
        `(async () => {
          const res = await fetch(${JSON.stringify(apiPath)}, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const text = await res.text();
          return { ok: res.ok, status: res.status, statusText: res.statusText, text };
        })()`,
        true,
      )) as { ok: boolean; status: number; statusText: string; text: string };

      if (!result.ok) {
        if (result.status === 401) throw new Error(sessionExpiredMessage());
        if (result.status === 403) throw new Error(forbiddenMessage());
        const snippet = result.text.slice(0, 200).replace(/\s+/g, " ").trim();
        throw new Error(
          `${result.statusText || `HTTP ${result.status}`}${snippet ? `: ${snippet}` : ""}`,
        );
      }

      try {
        return JSON.parse(result.text) as unknown;
      } catch {
        throw new Error("claude.ai returned non-JSON — session may be invalid");
      }
    } finally {
      win.destroy();
    }
  });
}
