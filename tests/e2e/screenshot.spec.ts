import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN = join(__dirname, "../../dist/electron/main.js");
const OUT = join(__dirname, "../screenshots");

/** Keep in sync with `src/renderer/App.tsx` `TABS` labels and order. */
const INVENTORY_TABS = [
  { label: "📋 Overview" },
  { label: "🧠 Models" },
  { label: "⚡ Skills" },
  { label: "🔌 MCP" },
  { label: "⚙️ Config" },
  { label: "🩺 Doctor" },
  { label: "🔄 Update" },
] as const;

/** Screenshots for README / docs — order matches docs/pages.md */
const SCREENSHOTS = [
  { filename: "01.overview.png", mode: "inventory" as const, tabIndex: 0 },
  { filename: "02.terminal.png", mode: "terminal" as const },
  ...INVENTORY_TABS.slice(1).map((tab, i) => ({
    filename: `${String(i + 3).padStart(2, "0")}.${tab.label.replace(/^\S+\s/, "").toLowerCase()}.png`,
    mode: "inventory" as const,
    tabIndex: i + 1,
  })),
] as const;

/**
 * Timeouts are upper bounds; Playwright proceeds as soon as conditions match.
 * One Electron session = one inventory scan — much faster than 8 cold starts.
 */
const CONTENT_TIMEOUT = 120_000;
const ASYNC_PANEL_TIMEOUT = 90_000;

test.setTimeout(600_000);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function waitForAppReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const inventoryTab = page.getByRole("tab", { name: "Inventory" });
  await expect(inventoryTab).toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(inventoryTab).toBeEnabled({ timeout: CONTENT_TIMEOUT });
}

async function waitForTerminalPane(page: Page) {
  await expect(page.getByText("Profiles", { exact: true })).toBeVisible({ timeout: CONTENT_TIMEOUT });
}

async function switchToTerminal(page: Page) {
  await page.getByRole("tab", { name: "Terminal" }).click();
  await waitForTerminalPane(page);
}

async function switchToInventory(page: Page) {
  await page.getByRole("tab", { name: "Inventory" }).click();
  const overview = page.getByRole("button", { name: INVENTORY_TABS[0].label });
  await expect(overview).toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(overview).toBeEnabled({ timeout: CONTENT_TIMEOUT });
}

async function goToInventoryTab(page: Page, tabIndex: number) {
  if (tabIndex > 0) {
    await page.getByRole("button", { name: INVENTORY_TABS[tabIndex].label }).click();
  }
}

/** Let async panels (Doctor IPC, Update scan) finish instead of a fixed sleep. */
async function waitForScreenshotSettled(
  page: Page,
  shot: (typeof SCREENSHOTS)[number],
) {
  if (shot.mode === "terminal") {
    await page.waitForTimeout(1_000);
    return;
  }

  switch (shot.tabIndex) {
    case 0:
      await expect(page.getByText("已安裝 / 偵測總數", { exact: true })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 1:
      await expect(page.getByRole("heading", { name: "🧠 Models" })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 2:
      await expect(page.getByRole("heading", { name: "⚡ Skills" })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 3:
      await expect(page.getByRole("heading", { name: "🔌 MCP Servers" })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 4:
      await expect(page.getByRole("heading", { name: "⚙️ Config Files" })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 5:
      await expect(page.getByRole("heading", { name: "🩺 Doctor" })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      await expect(page.getByText("Checking…")).toHaveCount(0, { timeout: ASYNC_PANEL_TIMEOUT });
      break;
    case 6:
      await expect(page.getByRole("heading", { name: "🔄 Update" })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      await expect(page.getByRole("button", { name: "🔍 Re-check All" })).toBeEnabled({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    default:
      break;
  }

  await page.waitForTimeout(500);
}

/**
 * Kill the process and all its children.
 * On Windows, `proc.kill()` only terminates the main process; GPU/renderer/network-service
 * child processes become orphaned and keep inherited stdio handles open, which prevents
 * Node's event loop from exiting after Playwright prints ✓.
 * `taskkill /T` walks the entire job/process tree before `proc` can become orphaned.
 */
function killProcessTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/F", "/PID", String(pid), "/T"], { stdio: "ignore" });
    } catch {
      /* already exited */
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already exited */
    }
  }
}

/** Avoid hanging after all screenshots: `app.close()` can wait indefinitely if the app won't exit. */
async function forceCloseElectron(app: ElectronApplication, timeoutMs = 5_000): Promise<void> {
  let proc: import("node:child_process").ChildProcess | undefined;
  let pid: number | undefined;
  try {
    proc = app.process();
    pid = proc.pid;
  } catch {
    proc = undefined;
  }

  // Attempt graceful quit first.
  try {
    await app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
  } catch {
    /* main process may already be tearing down */
  }

  // Kill the entire process tree NOW, while the main PID is still alive.
  // Must happen before app.close() which internally calls proc.kill() (main-only) and
  // would orphan GPU/renderer/network-service children whose inherited stdio handles
  // then keep Node's event loop alive after Playwright prints ✓.
  killProcessTree(pid);

  // Unref the child process so Node doesn't block waiting for its exit event.
  try {
    proc?.unref();
  } catch {
    /* ignore */
  }

  // Clean up Playwright's CDP/WebSocket side. The process is already killed so
  // this should resolve (or fail) quickly; the race cap is a last-resort guard.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    try {
      await Promise.race([
        app.close(),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("electron close timeout")), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch {
    /* ignore — process is already killed */
  }
}

test("documentation screenshots", async () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  try {
    app = await electron.launch({ args: [MAIN] });
    page = await app.firstWindow();
    await waitForAppReady(page);

    for (const shot of SCREENSHOTS) {
      await test.step(shot.filename, async () => {
        if (shot.mode === "terminal") {
          await switchToTerminal(page!);
        } else {
          await switchToInventory(page!);
          await goToInventoryTab(page!, shot.tabIndex);
        }
        await waitForScreenshotSettled(page!, shot);
        await page!.screenshot({ path: join(OUT, shot.filename), fullPage: true });
      });
    }
  } finally {
    try {
      await page?.close();
    } catch {
      /* closed or crashed */
    }
    if (app) {
      await forceCloseElectron(app);
    }
  }
});
