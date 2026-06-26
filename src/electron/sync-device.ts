import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const FILE = "sync-device-id";

export function getSyncDeviceId(): string {
  const path = join(app.getPath("userData"), FILE);
  if (existsSync(path)) {
    const id = readFileSync(path, "utf-8").trim();
    if (id) return id;
  }
  mkdirSync(dirname(path), { recursive: true });
  const id = randomUUID();
  writeFileSync(path, id, "utf-8");
  return id;
}
