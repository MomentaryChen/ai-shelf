#!/usr/bin/env node
/**
 * Verify Firebase env vars and whether Authentication is enabled for the project.
 * Usage: node scripts/verify-firebase-env.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

function loadEnvFile(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

const env = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

let failed = false;
for (const key of required) {
  if (!env[key]?.trim()) {
    console.error(`✗ Missing ${key}`);
    failed = true;
  } else {
    console.log(`✓ ${key} is set`);
  }
}

const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim();
const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
if (projectId && authDomain && !authDomain.startsWith(`${projectId}.`)) {
  console.warn(
    `⚠ authDomain "${authDomain}" does not start with project id "${projectId}." — double-check Web app config`,
  );
}

const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
if (!apiKey) {
  process.exit(1);
}

const url = `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(apiKey)}`;
console.log("\nProbing Identity Toolkit API…");

try {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log("✓ Firebase Authentication API reachable for this API key");
    console.log("\nIf sign-in still fails, confirm Google provider is enabled in Firebase Console.");
    process.exit(failed ? 1 : 0);
  }

  const message = body?.error?.message ?? res.statusText;
  console.error(`✗ Identity Toolkit responded ${res.status}: ${message}`);

  if (String(message).includes("CONFIGURATION_NOT_FOUND")) {
    console.error(`
→ Fix: Firebase Console → Build → Authentication → Get started
       → Sign-in method → Google → Enable → Save
`);
  } else if (String(message).toLowerCase().includes("api key not valid")) {
    console.error(`
→ Fix: Use apiKey from Firebase Console → Project settings → Your apps (Web), not Google Cloud Credentials.
`);
  }

  process.exit(1);
} catch (err) {
  console.error(`✗ Network error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
