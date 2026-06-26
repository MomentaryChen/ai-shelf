import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { waitForTerminalPane } from "./helpers/docs-locale.js";
import { prepareDocsSession } from "./helpers/docs-demo-workspace.js";
import { launchDocsElectron } from "./helpers/launch-docs-electron.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(__dirname, "../artifacts/terminal-demo-frames");
const OUT_GIF = join(__dirname, "../../docs/assets/terminal-demo.gif");
const DEMO_PROFILE = "Broadcast demo";

const CONTENT_TIMEOUT = 120_000;
const SHELL_READY_TIMEOUT = 30_000;

test.setTimeout(600_000);

test.describe.configure({ mode: "serial" });

test.skip(
  () => !process.env.GENERATE_TERMINAL_DEMO_GIF,
  "Set GENERATE_TERMINAL_DEMO_GIF=1 to record the README terminal demo GIF",
);

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
    /* ignore */
  }

  killProcessTree(pid);

  try {
    proc?.unref();
  } catch {
    /* ignore */
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      app.close(),
      new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("electron close timeout")), timeoutMs);
      }),
    ]);
  } catch {
    /* ignore */
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

class FrameCapture {
  private index = 0;

  constructor(private readonly page: Page) {}

  get count(): number {
    return this.index;
  }

  async snap(label: string, holdMs = 0): Promise<void> {
    const path = join(FRAMES_DIR, `${String(this.index).padStart(3, "0")}.png`);
    await this.page.screenshot({ path, animations: "disabled" });
    this.index += 1;
    if (holdMs > 0) await this.page.waitForTimeout(holdMs);
    void label;
  }

  async pause(label: string, shots: number, msPerShot: number): Promise<void> {
    for (let i = 0; i < shots; i += 1) {
      await this.snap(`${label}-${i}`, msPerShot);
    }
  }
}

async function waitForAppReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const inventoryTab = page.getByRole("tab", { name: /Inventory|清單/i });
  await expect(inventoryTab).toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(inventoryTab).toBeEnabled({ timeout: CONTENT_TIMEOUT });
}

async function switchToTerminal(page: Page) {
  await page.getByRole("tab", { name: /Terminal|終端/i }).click();
  await waitForTerminalPane(page, CONTENT_TIMEOUT);
}

async function resizeMainWindow(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.setContentSize(1280, 800);
      win.center();
    }
  });
  await new Promise((r) => setTimeout(r, 400));
}

async function cleanupDemoProfile(page: Page) {
  await page.evaluate(async (name) => {
    const forest = await window.api.profileGroupGetForest();
    if (!forest.success || !forest.forest) return;
    for (const group of forest.forest.groups) {
      for (const profile of group.profiles) {
        if (profile.name === name) {
          await window.api.profileDelete(profile.id);
        }
      }
    }
  }, DEMO_PROFILE);
}

async function waitForShellPanes(page: Page, count: number) {
  await expect(page.locator(".xterm")).toHaveCount(count, { timeout: SHELL_READY_TIMEOUT });
  await page.waitForTimeout(1200);
}

async function addShellPane(page: Page) {
  await page.getByRole("button", { name: /\+ Pane|\+ 窗格/i }).click();
  await page
    .getByRole("menuitem", { name: /Shell only|純終端機|no AI|不開 AI/i })
    .click();
}

async function focusFirstTerminal(page: Page) {
  await page.locator(".xterm").first().click({ position: { x: 40, y: 40 } });
  await page.waitForTimeout(200);
}

test("terminal mode demo GIF for README", async () => {
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  let app: ElectronApplication | undefined;
  let page: Page | undefined;

  try {
    app = await launchDocsElectron();
    page = await app.firstWindow();
    await resizeMainWindow(app);
    await prepareDocsSession(page, waitForAppReady);
    await cleanupDemoProfile(page);

    const frames = new FrameCapture(page);
    await switchToTerminal(page);
    await frames.pause("terminal-home", 4, 350);

    await page.getByTitle("New profile").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await frames.pause("create-dialog", 3, 350);

    await dialog.locator("select").first().selectOption("template-multi");
    await frames.pause("template-multi", 3, 350);

    const nameInput = dialog.getByPlaceholder(/e\.g\. Work|Work, Side|例如|work、side-project/i);
    await nameInput.fill(DEMO_PROFILE);
    await expect(nameInput).toHaveValue(DEMO_PROFILE);
    await frames.pause("profile-name", 2, 350);

    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden({ timeout: CONTENT_TIMEOUT });
    await expect(page.getByRole("button", { name: DEMO_PROFILE })).toBeVisible({
      timeout: CONTENT_TIMEOUT,
    });
    await frames.pause("profile-created", 4, 350);

    await addShellPane(page);
    await waitForShellPanes(page, 1);
    await frames.pause("pane-one", 4, 350);

    await addShellPane(page);
    await waitForShellPanes(page, 2);
    await frames.pause("pane-two", 4, 350);

    const profileRow = page.getByRole("button", { name: DEMO_PROFILE });
    const syncInProfile = profileRow.locator('input[type="checkbox"]');
    if ((await syncInProfile.count()) > 0) {
      await expect(syncInProfile).toBeChecked();
    }
    await frames.pause("broadcast-on", 3, 350);

    await focusFirstTerminal(page);
    await page.keyboard.type("echo broadcast demo");
    await frames.pause("typing", 2, 300);
    await page.keyboard.press("Enter");
    await frames.pause("echo-result", 16, 350);

    execFileSync(
      process.execPath,
      [
        join(__dirname, "../../scripts/png-sequence-to-gif.mjs"),
        FRAMES_DIR,
        OUT_GIF,
        "3",
        "960",
      ],
      { stdio: "inherit" },
    );

    writeFileSync(
      join(FRAMES_DIR, "manifest.json"),
      JSON.stringify({ profile: DEMO_PROFILE, frames: frames.count, out: OUT_GIF }, null, 2),
    );
  } finally {
    try {
      await page?.close();
    } catch {
      /* ignore */
    }
    if (app) {
      await forceCloseElectron(app);
    }
  }
});
