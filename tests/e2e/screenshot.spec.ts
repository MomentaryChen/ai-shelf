import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { DOCS_SCREENSHOT_LOCALE, waitForTerminalPane } from "./helpers/docs-locale.js";
import { prepareDocsSession } from "./helpers/docs-demo-workspace.js";
import { launchDocsElectron } from "./helpers/launch-docs-electron.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../screenshots");

/** Left-rail nav — keep in sync with `src/renderer/App.tsx` inventory tabs (excludes usage). */
const INVENTORY_NAV = [
  { filename: "01.overview.png", tabIndex: 0, nav: /Overview|總覽/i },
  { filename: "02.terminal.png", mode: "terminal" as const },
  { filename: "03.models.png", tabIndex: 1, nav: /Models|模型/i },
  { filename: "04.skills.png", tabIndex: 2, nav: /Skills|技能/i },
  { filename: "05.mcp.png", tabIndex: 3, nav: /^MCP$/i },
  { filename: "06.config.png", tabIndex: 4, nav: /Config|設定/i },
  { filename: "07.doctor.png", tabIndex: 5, nav: /Doctor|診斷/i },
  { filename: "08.update.png", tabIndex: 6, nav: /Update|更新/i },
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
  const inventoryTab = page.getByRole("tab", { name: /Inventory|清單/i });
  await expect(inventoryTab).toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(inventoryTab).toBeEnabled({ timeout: CONTENT_TIMEOUT });
}

async function dismissBlockingDialog(page: Page) {
  const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
  if ((await overlay.count()) === 0) return;

  const closeButton = page.getByRole("button", { name: /Close|Skip|Later|關閉|略過|稍後|之後/i });
  if (await closeButton.first().isVisible().catch(() => false)) {
    await closeButton.first().click();
  } else {
    await page.keyboard.press("Escape");
  }

  await expect(overlay).toHaveCount(0, { timeout: 10_000 });
}

async function switchToTerminal(page: Page) {
  await dismissBlockingDialog(page);
  await page.getByRole("tab", { name: /Terminal|終端/i }).click();
  await waitForTerminalPane(page, CONTENT_TIMEOUT);
}

async function switchToInventory(page: Page) {
  await dismissBlockingDialog(page);
  await page.getByRole("tab", { name: /Inventory|清單/i }).click();
  const overview = page.getByRole("button", { name: INVENTORY_NAV[0].nav });
  await expect(overview).toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(overview).toBeEnabled({ timeout: CONTENT_TIMEOUT });
}

async function goToInventoryTab(page: Page, tabIndex: number) {
  const item = INVENTORY_NAV.find((it) => "tabIndex" in it && it.tabIndex === tabIndex);
  if (item && "nav" in item && tabIndex > 0) {
    await page.getByRole("button", { name: item.nav }).click();
  }
}

/** Let async panels (Doctor IPC, Update scan) finish instead of a fixed sleep. */
async function waitForScreenshotSettled(page: Page, tabIndex: number) {
  switch (tabIndex) {
    case 0:
      await expect(
        page.getByText(
          DOCS_SCREENSHOT_LOCALE === "zh" ? "已安裝 / 偵測總數" : "Installed / detected",
          { exact: true },
        ),
      ).toBeVisible({ timeout: ASYNC_PANEL_TIMEOUT });
      break;
    case 1:
      await expect(page.getByRole("heading", { name: /Models|模型/ })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 2:
      await expect(page.getByRole("heading", { name: /Skills|技能/ })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 3:
      await expect(page.getByRole("heading", { name: /^MCP$/ })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 4:
      await expect(page.getByRole("heading", { name: /Config|設定/ })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 5:
      await expect(page.getByRole("heading", { name: /Doctor|診斷/ })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      await expect(page.getByText(/Checking…|檢查中…/)).toHaveCount(0, {
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      break;
    case 6:
      await expect(page.getByRole("heading", { name: /Update|更新/ })).toBeVisible({
        timeout: ASYNC_PANEL_TIMEOUT,
      });
      await expect(page.getByRole("button", { name: /Re-check|全部重新檢查/i })).toBeEnabled({
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

  try {
    await app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
  } catch {
    /* main process may already be tearing down */
  }

  killProcessTree(pid);

  try {
    proc?.unref();
  } catch {
    /* ignore */
  }

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
    app = await launchDocsElectron();
    page = await app.firstWindow();
    await prepareDocsSession(page, waitForAppReady);

    for (const shot of INVENTORY_NAV) {
      await test.step(shot.filename, async () => {
        if ("mode" in shot && shot.mode === "terminal") {
          await switchToTerminal(page!);
          await page!.waitForTimeout(1_000);
        } else {
          await switchToInventory(page!);
          if ("tabIndex" in shot) {
            await goToInventoryTab(page!, shot.tabIndex);
            await waitForScreenshotSettled(page!, shot.tabIndex);
          }
        }
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
