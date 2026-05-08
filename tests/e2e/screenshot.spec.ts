import { test, _electron as electron } from "@playwright/test";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN = join(__dirname, "../../dist/electron/main.js");
const OUT = join(__dirname, "../screenshots");

const TABS = [
  { label: "📋 Overview" },
  { label: "🧠 Models" },
  { label: "⚡ Skills" },
  { label: "🔌 MCP" },
  { label: "⚙️ Config" },
  { label: "🩺 Doctor" },
  { label: "🔄 Update" },
];

test.describe.configure({ mode: "parallel" });
test.setTimeout(120_000);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const [i, tab] of TABS.entries()) {
  const num = String(i + 1).padStart(2, "0");
  const id = tab.label.replace(/^\S+\s/, "").toLowerCase(); // strip emoji
  const filename = `${num}.${id}.png`;

  test(filename, async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.waitForLoadState("domcontentloaded");

    // Wait for inventory to finish loading (tabs become clickable)
    await page.waitForFunction(
      () => {
        const btns = document.querySelectorAll("nav button");
        return btns.length > 0 && !btns[0].hasAttribute("disabled");
      },
      { timeout: 90_000 }
    );

    // Navigate to this tab (skip click for the first tab — Overview is default)
    if (i > 0) {
      await page.click(`nav button:has-text("${tab.label}")`);
    }

    // Wait 20s for async content (Doctor checks, Update scan, etc.) to settle
    await page.waitForTimeout(20_000);

    await page.screenshot({ path: join(OUT, filename), fullPage: true });
    await app.close();
  });
}


