import { readFileSync, mkdirSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";
import { AppConfigSchema, type AppConfig, APP_NAME } from "./config.js";

const DEFAULT_CONFIG = {
  workspaceRoot: "",
  defaultShell: "pwsh",
  logLevel: "info",
} as const;

export function getAppDataDir(): string {
  const override = process.env.AISHELF_APP_DATA_DIR?.trim();
  if (override) return override;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, APP_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, APP_NAME);
}

export function getDatabasePath(): string {
  return join(getAppDataDir(), "workspaces.db");
}

export function getConfigPath(): string {
  return join(getAppDataDir(), "config.yaml");
}

const LEGACY_APP_NAME = "ai-cli-inventory";

function migrateLegacyAppDataDir(): void {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    const legacyDir = join(appData, LEGACY_APP_NAME);
    const newDir = join(appData, APP_NAME);
    if (existsSync(legacyDir) && !existsSync(newDir)) {
      renameSync(legacyDir, newDir);
    }
    return;
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  const legacyDir = join(xdg, LEGACY_APP_NAME);
  const newDir = join(xdg, APP_NAME);
  if (existsSync(legacyDir) && !existsSync(newDir)) {
    renameSync(legacyDir, newDir);
  }
}

export function ensureAppDataDir(): string {
  migrateLegacyAppDataDir();
  const dir = getAppDataDir();
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "logs"), { recursive: true });
  return dir;
}

export function loadConfig(): AppConfig {
  ensureAppDataDir();
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    writeFileSync(configPath, stringify(DEFAULT_CONFIG), "utf8");
  }

  const raw = parse(readFileSync(configPath, "utf8")) as unknown;
  return AppConfigSchema.parse(raw);
}
