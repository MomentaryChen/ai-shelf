import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { join, dirname } from "path";
import { mkdirSync, copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { prepareDocsSession } from "./helpers/docs-demo-workspace.js";
import { launchDocsElectron } from "./helpers/launch-docs-electron.js";
import { waitForTerminalPane } from "./helpers/docs-locale.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = "/opt/cursor/artifacts";

test.setTimeout(300_000);

async function waitForAppReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const inventoryTab = page.getByRole("tab", { name: /Inventory|清單/i });
  await expect(inventoryTab).toBeVisible({ timeout: 120_000 });
  await expect(inventoryTab).toBeEnabled({ timeout: 120_000 });
}

const PROFILE_CWDS = ["/tmp/optim-cloud-backend", "/tmp/optim-feature", "/tmp/openapi-docs"];

async function isToolInstalled(page: Page, tool: string): Promise<boolean> {
  return page.evaluate(async (id) => {
    const entries = await window.api.getInventory();
    return entries.some((e) => e.tool === id && e.available);
  }, tool);
}

async function seedCompactProfiles(page: Page) {
  for (const cwd of PROFILE_CWDS) mkdirSync(cwd, { recursive: true });
  const result = await page.evaluate(async () => {
    const forest = await window.api.profileGroupGetForest();
    if (!forest.success || !forest.forest) {
      return { ok: false as const, error: forest.error ?? "no forest" };
    }
    const group = forest.forest.groups[0];
    if (!group) return { ok: false as const, error: "no group" };

    const specs = [
      { name: "Optim Cloud Backend", accent: "#7ec8e8", cwd: "/tmp/optim-cloud-backend" },
      { name: "Optim Feature", accent: "#9dd89d", cwd: "/tmp/optim-feature" },
      { name: "Open API Document", accent: "#a8b4f0", cwd: "/tmp/openapi-docs" },
    ] as const;

    const created: string[] = [];
    for (const spec of specs) {
      const r = await window.api.profileCreate(spec.name, {
        groupId: group.id,
        defaultCwd: spec.cwd,
        accentColor: spec.accent,
        defaultTool: "claude",
      });
      if (!r.success) {
        return { ok: false as const, error: r.error ?? `failed ${spec.name}` };
      }
      created.push(spec.name);
    }
    window.dispatchEvent(new Event("ai-shelf-profiles-changed"));
    return { ok: true as const, created };
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

test("sidebar compact profile list visuals", async () => {
  mkdirSync(OUT, { recursive: true });
  let app: ElectronApplication | undefined;
  let page: Page | undefined;

  try {
    app = await launchDocsElectron();
    page = await app.firstWindow();
    await prepareDocsSession(page, waitForAppReady);

    await page.getByRole("tab", { name: /Terminal|終端/i }).click();
    await waitForTerminalPane(page, 120_000);
    await seedCompactProfiles(page);

    await expect(page.getByText("Optim Cloud Backend", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Optim Feature", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const backendRow = page
      .locator(".group\\/profile")
      .filter({ hasText: "Optim Cloud Backend" })
      .first();
    await expect(backendRow).toBeVisible();
    await backendRow.getByText("Optim Cloud Backend", { exact: true }).click();
    await backendRow.hover();
    const addTerminal = backendRow.getByTitle(/Add terminal|新增 terminal/i);
    await expect(addTerminal).toBeVisible();
    // Profiles default to Claude; when it isn't installed the UI must not offer it.
    const claudeInstalled = await isToolInstalled(page, "claude");
    if (!claudeInstalled) {
      await expect(addTerminal).not.toHaveAttribute("title", /Claude/i, { timeout: 30_000 });
    }
    await addTerminal.click();

    // Live terminal row should appear under the expanded profile with cwd subtitle.
    await expect(page.locator(".group\\/term").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("/tmp/optim-cloud-backend").first()).toBeVisible({
      timeout: 30_000,
    });

    const shotPath = join(OUT, "sidebar-compact-list.png");
    await page.screenshot({ path: shotPath, animations: "disabled" });

    await backendRow.hover();
    await backendRow.getByTitle(/Profile actions|Profile 操作/i).click();
    const menuAdd = page.getByRole("menuitem", { name: /Add terminal|新增 terminal/i }).first();
    await expect(menuAdd).toBeVisible({ timeout: 10_000 });
    if (!claudeInstalled) await expect(menuAdd).not.toContainText(/Claude/i);
    const menuShot = join(OUT, "sidebar-compact-menu.png");
    await page.screenshot({ path: menuShot, animations: "disabled" });

    // Keep a second copy for PR embedding convenience.
    copyFileSync(shotPath, join(OUT, "sidebar-profile-compact.png"));
    copyFileSync(menuShot, join(OUT, "sidebar-profile-compact-menu.png"));

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^\+ (Pane|窗格)$/ }).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    if (!claudeInstalled) {
      await expect(page.getByRole("menuitem", { name: /Claude/i })).toHaveCount(0);
    }
  } finally {
    if (app) await app.close().catch(() => undefined);
  }
});
