import { _electron as electron } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import {
  docsElectronEnv,
  docsElectronUserDataDir,
  resetDocsDemoUserData,
} from "./docs-demo-workspace.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** App root so Electron reads this repo's package.json (`app.getVersion()`). */
const APP_ROOT = join(__dirname, "../../..");

export async function launchDocsElectron(): Promise<ElectronApplication> {
  const appDataDir = resetDocsDemoUserData();
  return electron.launch({
    cwd: APP_ROOT,
    args: [APP_ROOT, `--user-data-dir=${docsElectronUserDataDir(appDataDir)}`],
    env: docsElectronEnv(appDataDir),
  });
}
