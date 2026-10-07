import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { prepareDocsSession } from "./helpers/docs-demo-workspace.js";
import { launchDocsElectron } from "./helpers/launch-docs-electron.js";
import { waitForTerminalPane } from "./helpers/docs-locale.js";

const OUT = "/opt/cursor/artifacts/even-panes";
test.setTimeout(300_000);

async function waitForAppReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("tab", { name: /Inventory|清單/i })).toBeEnabled({
    timeout: 120_000,
  });
}

test("adding panes splits width evenly", async () => {
  mkdirSync(OUT, { recursive: true });
  let app: ElectronApplication | undefined;
  try {
    app = await launchDocsElectron();
    const page = await app.firstWindow();
    await prepareDocsSession(page, waitForAppReady);
    await page.getByRole("tab", { name: /Terminal|終端/i }).click();
    await waitForTerminalPane(page, 120_000);
    await page.evaluate(async () => {
      const forest = await window.api.profileGroupGetForest();
      await window.api.profileCreate("Even Split", {
        groupId: forest.forest!.groups[0]!.id,
        defaultCwd: "/tmp",
      });
      window.dispatchEvent(new Event("ai-shelf-profiles-changed"));
    });
    const row = page.locator(".group\\/profile").filter({ hasText: "Even Split" }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByText("Even Split", { exact: true }).click();
    await page.getByRole("button", { name: /開啟終端機|Open shell/i }).click();
    await expect(page.locator(".warp-pane-body")).toHaveCount(1, { timeout: 30_000 });

    const addPane = page.getByRole("button", { name: /^\+ (窗格|Pane)$/ });
    for (let n = 2; n <= 8; n++) {
      await addPane.click();
      await page.getByRole("menuitem").first().click();
      await expect(page.locator(".warp-pane-body")).toHaveCount(n, { timeout: 30_000 });
      await page.waitForTimeout(800);
      const widths = await page
        .locator(".warp-pane-body")
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      console.log(`panes=${n} widths=${widths.join(",")}`);
      const spread = Math.max(...widths) - Math.min(...widths);
      expect(spread, `uneven widths at ${n}: ${widths}`).toBeLessThanOrEqual(4);
      if (n === 4 || n === 8) await page.screenshot({ path: `${OUT}/after-${n}-panes.png` });
    }
  } finally {
    await app?.close();
  }
});
