import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { getAppDataDir, getDatabasePath } from "ai-shelf";
import { BACKUP_FORMAT_VERSION } from "../shared/backup-keys.js";
import { backupFile } from "../utils/config.js";
import { closeWorkspaceContext, getWorkspaceContext } from "./workspace-host.js";

export interface BackupManifest {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  appVersion: string;
  exportedAt: string;
  localStorage: Record<string, string>;
}

interface JsonBackupFile extends BackupManifest {
  configYaml: string | null;
  databaseBase64: string;
}

function getConfigPath(): string {
  return join(getAppDataDir(), "config.yaml");
}

function readConfigYaml(): string | null {
  const path = getConfigPath();
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

function snapshotDatabase(): Buffer {
  closeWorkspaceContext();
  try {
    return readFileSync(getDatabasePath());
  } finally {
    getWorkspaceContext();
  }
}

function removeWalShm(dbPath: string): void {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = dbPath + suffix;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
}

function validateManifest(manifest: BackupManifest): void {
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${manifest.formatVersion}`);
  }
}

function buildManifest(appVersion: string, localStorage: Record<string, string>): BackupManifest {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    localStorage,
  };
}

export function createZipBackup(appVersion: string, localStorage: Record<string, string>): Uint8Array {
  const manifest = buildManifest(appVersion, localStorage);
  const dbBytes = snapshotDatabase();
  const configYaml = readConfigYaml();

  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "workspaces.db": new Uint8Array(dbBytes),
  };
  if (configYaml !== null) {
    files["config.yaml"] = strToU8(configYaml);
  }
  return zipSync(files);
}

export function createJsonBackup(appVersion: string, localStorage: Record<string, string>): JsonBackupFile {
  const dbBytes = snapshotDatabase();
  return {
    ...buildManifest(appVersion, localStorage),
    configYaml: readConfigYaml(),
    databaseBase64: dbBytes.toString("base64"),
  };
}

function parseJsonBackup(data: Buffer): { manifest: BackupManifest; dbBytes: Buffer; configYaml: string | null } {
  const parsed = JSON.parse(data.toString("utf-8")) as JsonBackupFile;
  validateManifest(parsed);
  if (!parsed.databaseBase64) {
    throw new Error("Invalid backup: missing database");
  }
  return {
    manifest: parsed,
    dbBytes: Buffer.from(parsed.databaseBase64, "base64"),
    configYaml: parsed.configYaml ?? null,
  };
}

function parseZipBackup(data: Buffer): { manifest: BackupManifest; dbBytes: Buffer; configYaml: string | null } {
  const unzipped = unzipSync(new Uint8Array(data));
  const manifestRaw = unzipped["manifest.json"];
  if (!manifestRaw) throw new Error("Invalid backup: missing manifest.json");

  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as BackupManifest;
  validateManifest(manifest);

  const dbRaw = unzipped["workspaces.db"];
  if (!dbRaw) throw new Error("Invalid backup: missing workspaces.db");

  const configRaw = unzipped["config.yaml"];
  return {
    manifest,
    dbBytes: Buffer.from(dbRaw),
    configYaml: configRaw ? new TextDecoder().decode(configRaw) : null,
  };
}

export function parseBackupFile(data: Buffer): {
  manifest: BackupManifest;
  dbBytes: Buffer;
  configYaml: string | null;
} {
  const trimmed = data.toString("utf-8", 0, Math.min(data.length, 16)).trimStart();
  if (trimmed.startsWith("{")) {
    return parseJsonBackup(data);
  }
  return parseZipBackup(data);
}

export function applyBackup(data: Buffer): BackupManifest {
  const { manifest, dbBytes, configYaml } = parseBackupFile(data);

  const dbPath = getDatabasePath();
  backupFile(dbPath);
  const configPath = getConfigPath();
  if (existsSync(configPath)) backupFile(configPath);

  closeWorkspaceContext();
  try {
    removeWalShm(dbPath);
    writeFileSync(dbPath, dbBytes);
    if (configYaml !== null) {
      writeFileSync(configPath, configYaml, "utf-8");
    }
  } finally {
    getWorkspaceContext();
  }

  return manifest;
}
