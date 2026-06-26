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
const MAIN = join(__dirname, "../../../dist/electron/main.js");

export async function launchDocsElectron(): Promise<ElectronApplication> {
  const appDataDir = resetDocsDemoUserData();
  return electron.launch({
    args: [MAIN, `--user-data-dir=${docsElectronUserDataDir(appDataDir)}`],
    env: docsElectronEnv(appDataDir),
  });
}
