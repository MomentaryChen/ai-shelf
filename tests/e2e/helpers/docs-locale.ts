import { expect, type Page } from "@playwright/test";

/** README / docs screenshots use zh labels (see docs/pages.zh-TW.md). Override via env. */
export const DOCS_SCREENSHOT_LOCALE = process.env.AISHELF_DOCS_LOCALE === "en" ? "en" : "zh";

/** Sidebar section heading — not the profile-group name (e.g. default group "Profiles"). */
export const PROFILE_SECTION_TITLE = DOCS_SCREENSHOT_LOCALE === "en" ? "Profiles" : "Profile";

const SETTINGS_KEY = "ai-inventory-chat-settings";

/** Pin locale so CI (en-US runner) and dev machines produce the same docs images. */
export async function forceDocsLocale(page: Page): Promise<void> {
  await page.evaluate(
    ({ locale, settingsKey }) => {
      const stored = JSON.parse(localStorage.getItem(settingsKey) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(settingsKey, JSON.stringify({ ...stored, locale }));
    },
    { locale: DOCS_SCREENSHOT_LOCALE, settingsKey: SETTINGS_KEY },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
}

/** Terminal sidebar ready — targets the uppercase section label, not group names. */
export async function waitForTerminalPane(page: Page, timeout = 120_000): Promise<void> {
  const heading = page
    .locator("div.font-semibold.uppercase")
    .getByText(PROFILE_SECTION_TITLE, { exact: true });
  await expect(heading).toBeVisible({ timeout });
}
