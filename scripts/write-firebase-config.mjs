#!/usr/bin/env node
/**
 * Embed Firebase client config for the Electron main process at build time.
 * Vite only injects VITE_* into the renderer; packaged apps have no .env at runtime.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "dist", "electron");
const OUT_FILE = join(OUT_DIR, "firebase-config.json");

function loadEnvFile(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
const projectId = (process.env.VITE_FIREBASE_PROJECT_ID ?? fileEnv.VITE_FIREBASE_PROJECT_ID ?? "").trim();

mkdirSync(OUT_DIR, { recursive: true });

if (!projectId) {
  writeFileSync(OUT_FILE, "{}\n", "utf8");
  console.log("write-firebase-config: no VITE_FIREBASE_PROJECT_ID — wrote empty config");
  process.exit(0);
}

writeFileSync(OUT_FILE, `${JSON.stringify({ projectId }, null, 2)}\n`, "utf8");
console.log(`write-firebase-config: wrote ${OUT_FILE}`);
