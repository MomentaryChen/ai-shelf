import { rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import { expect, type Page } from "@playwright/test";
import { DOCS_SCREENSHOT_LOCALE, forceDocsLocale } from "./docs-locale.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Profile group name shown in README terminal screenshots (not the default "Profiles"). */
export const DOCS_DEMO_GROUP_NAME = "Demo";

const DEMO_USER_DATA_DIR = join(__dirname, "../../fixtures/docs-demo-userdata");

/** Wipe and recreate isolated app data for reproducible docs captures. */
export function resetDocsDemoUserData(): string {
  rmSync(DEMO_USER_DATA_DIR, { recursive: true, force: true });
  mkdirSync(DEMO_USER_DATA_DIR, { recursive: true });
  return DEMO_USER_DATA_DIR;
}

export function docsElectronEnv(appDataDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AISHELF_APP_DATA_DIR: appDataDir,
    AISHELF_DOCS_LOCALE: DOCS_SCREENSHOT_LOCALE,
  };
}

export function docsElectronUserDataDir(appDataDir: string): string {
  return join(appDataDir, "electron");
}

/** Rename the default group to Demo and remove extra groups / profiles. */
export async function seedDocsDemoWorkspace(page: Page): Promise<boolean> {
  return page.evaluate(async (groupName) => {
    const forest = await window.api.profileGroupGetForest();
    if (!forest.success || !forest.forest) return false;

    let groups = forest.forest.groups;
    let changed = false;

    if (groups.length === 0) {
      const created = await window.api.profileGroupCreate(groupName);
      return Boolean(created.success);
    }

    const primary = groups[0]!;
    if (primary.name !== groupName) {
      await window.api.profileGroupUpdate(primary.id, groupName);
      changed = true;
    }

    for (const group of groups.slice(1)) {
      await window.api.profileGroupDelete(group.id);
      changed = true;
    }

    for (const profile of primary.profiles) {
      await window.api.profileDelete(profile.id);
      changed = true;
    }

    return changed;
  }, DOCS_DEMO_GROUP_NAME);
}

export async function expectDocsDemoGroup(page: Page, timeout = 120_000): Promise<void> {
  await expect(
    page.locator(".truncate.text-chrome-text").getByText(DOCS_DEMO_GROUP_NAME, { exact: true }),
  ).toBeVisible({ timeout });
}

export async function prepareDocsSession(
  page: Page,
  waitForAppReady: (page: Page) => Promise<void>,
): Promise<void> {
  await forceDocsLocale(page);
  await waitForAppReady(page);
  if (await seedDocsDemoWorkspace(page)) {
    await forceDocsLocale(page);
    await waitForAppReady(page);
  }
  await expectDocsDemoGroup(page);
}
