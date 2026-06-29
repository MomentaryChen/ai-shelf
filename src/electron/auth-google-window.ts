import { BrowserWindow, session } from "electron";
import { getRendererPageUrl } from "./renderer-server.js";
import { RENDERER_SESSION_PARTITION } from "./session-partition.js";
import { getAuthStatePublic } from "./auth-service.js";
import type { AuthStatePublic } from "../shared/auth-types.js";

export interface GoogleAuthWindowResult {
  ok: boolean;
  error?: string;
  state?: AuthStatePublic;
}

let authWindow: BrowserWindow | null = null;
let pending: ((result: GoogleAuthWindowResult) => void) | null = null;

function attachAuthOAuthNavigation(win: BrowserWindow, target: BrowserWindow): void {
  const notify = (url: string) => {
    try {
      const parsed = new URL(url);
      const local =
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
      if (!local) return;
      const isAuthCallback =
        parsed.pathname.startsWith("/__/auth/") ||
        parsed.hash.includes("access_token") ||
        parsed.hash.includes("id_token") ||
        parsed.searchParams.has("code");
      if (!isAuthCallback && !parsed.hash.includes("__/auth/")) return;
      if (!target.isDestroyed()) {
        target.webContents.send("auth-oauth-navigated", url);
      }
    } catch {
      /* ignore */
    }
  };
  win.webContents.on("did-navigate", (_event, url) => notify(url));
  win.webContents.on("did-navigate-in-page", (_event, url) => notify(url));
  win.webContents.on("will-navigate", (_event, url) => notify(url));
}

function attachAuthPopupNavigation(authWin: BrowserWindow): void {
  attachAuthOAuthNavigation(authWin, authWin);
  authWin.webContents.on("did-create-window", (child) => {
    attachAuthOAuthNavigation(child, authWin);
  });

  const ses = session.fromPartition(RENDERER_SESSION_PARTITION);
  const filter = { urls: ["http://localhost/*", "http://127.0.0.1/*"] };
  const onOAuthCompleted = (details: Electron.OnCompletedListenerDetails) => {
    const url = details.url;
    if (
      !url.includes("/__/auth/") &&
      !url.includes("access_token") &&
      !url.includes("id_token") &&
      !url.includes("code=")
    ) {
      return;
    }
    if (!authWin.isDestroyed()) {
      authWin.webContents.send("auth-oauth-navigated", url);
    }
  };
  ses.webRequest.onCompleted(filter, onOAuthCompleted);
  authWin.on("closed", () => {
    ses.webRequest.onCompleted(filter, null);
  });
}

export function openGoogleAuthWindow(
  parent: BrowserWindow | null,
  preloadPath: string,
): Promise<GoogleAuthWindowResult> {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return Promise.resolve({ ok: false, error: "auth_window_already_open" });
  }

  return new Promise((resolve) => {
    pending = resolve;

    authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      modal: parent != null,
      parent: parent ?? undefined,
      show: false,
      autoHideMenuBar: true,
      title: "Google Sign-in",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        partition: RENDERER_SESSION_PARTITION,
        // @ts-expect-error Electron WebPreferences typing omits nativeWindowOpen
        nativeWindowOpen: true,
      },
    });

    attachAuthPopupNavigation(authWindow);

    authWindow.once("ready-to-show", () => {
      authWindow?.show();
    });

    void authWindow.loadURL(getRendererPageUrl("auth-google"));

    authWindow.on("closed", () => {
      authWindow = null;
      if (pending) {
        const state = getAuthStatePublic(true);
        if (state.signedIn) {
          pending({ ok: true, state });
        } else {
          pending({ ok: false, error: "window_closed" });
        }
        pending = null;
      }
    });
  });
}

export function finishGoogleAuthWindow(result: GoogleAuthWindowResult): void {
  const win = authWindow;
  const parent = win?.getParentWindow() ?? null;

  const resolved: GoogleAuthWindowResult = {
    ...result,
    state: result.state ?? (result.ok ? getAuthStatePublic(true) : undefined),
  };

  if (pending) {
    pending(resolved);
    pending = null;
  }
  authWindow = null;
  if (win && !win.isDestroyed()) {
    win.close();
  }
  if (parent && !parent.isDestroyed()) {
    parent.show();
    parent.focus();
  }
}
