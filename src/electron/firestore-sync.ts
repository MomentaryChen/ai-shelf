import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { CloudSyncStateDoc, SyncBundle } from "../shared/sync-types.js";
import { getAuthIdToken, getAuthUid } from "./auth-service.js";

function loadEnvValue(key: string): string {
  const roots = [process.cwd(), app.isPackaged ? app.getAppPath() : process.cwd()];
  for (const root of roots) {
    for (const name of [".env.local", ".env"]) {
      const path = join(root, name);
      if (!existsSync(path)) continue;
      for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        if (trimmed.slice(0, eq).trim() === key) {
          return trimmed.slice(eq + 1).trim();
        }
      }
    }
  }
  return process.env[key]?.trim() ?? "";
}

function projectId(): string {
  const id = loadEnvValue("VITE_FIREBASE_PROJECT_ID");
  if (!id) throw new Error("VITE_FIREBASE_PROJECT_ID is not set");
  return id;
}

function syncDocPath(uid: string): string {
  return `projects/${projectId()}/databases/(default)/documents/users/${uid}/sync/state`;
}

function syncDocUrl(uid: string): string {
  return `https://firestore.googleapis.com/v1/${syncDocPath(uid)}`;
}

function parseIntegerField(fields: Record<string, FirestoreValue>, key: string): number | null {
  const raw = fields[key]?.integerValue;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseStringField(fields: Record<string, FirestoreValue>, key: string): string | null {
  const raw = fields[key]?.stringValue;
  return typeof raw === "string" ? raw : null;
}

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

function bundleFromDocument(doc: FirestoreDocument): CloudSyncStateDoc | null {
  const fields = doc.fields;
  if (!fields) return null;

  const revision = parseIntegerField(fields, "revision");
  const version = parseIntegerField(fields, "version");
  const updatedAt = parseStringField(fields, "updatedAt");
  const bundleJson = parseStringField(fields, "bundleJson");

  if (bundleJson) {
    try {
      const bundle = JSON.parse(bundleJson) as SyncBundle;
      if (!bundle || typeof bundle !== "object") return null;
      return {
        version: (version ?? bundle.version) as CloudSyncStateDoc["version"],
        revision: revision ?? 0,
        updatedAt: updatedAt ?? new Date().toISOString(),
        bundle,
      };
    } catch {
      return null;
    }
  }

  // Legacy: nested map written by the client SDK (best-effort unsupported here).
  return null;
}

function formatFirestoreError(status: number, body: string): Error {
  if (status === 401) return new Error("Firebase ID token expired — sign out and sign in again");
  if (status === 403 || status === 404) {
    if (/PERMISSION_DENIED|insufficient permissions/i.test(body)) {
      return new Error(
        "Firestore denied access. In Firebase Console → Firestore → Rules, paste docs/firestore.rules.example and publish.",
      );
    }
  }
  return new Error(body || `Firestore HTTP ${status}`);
}

export async function pullRemoteSyncStateMain(uid: string): Promise<CloudSyncStateDoc | null> {
  const token = getAuthIdToken();
  if (!token) throw new Error("not_signed_in");

  const res = await fetch(syncDocUrl(uid), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw formatFirestoreError(res.status, body);
  }

  const doc = (await res.json()) as FirestoreDocument;
  return bundleFromDocument(doc);
}

export async function pushRemoteSyncStateMain(
  uid: string,
  bundle: SyncBundle,
  revision: number,
): Promise<void> {
  const token = getAuthIdToken();
  if (!token) throw new Error("not_signed_in");

  const sessionUid = getAuthUid();
  if (sessionUid && sessionUid !== uid) {
    throw new Error("auth_uid_mismatch");
  }

  const url = `${syncDocUrl(uid)}?updateMask.fieldPaths=version&updateMask.fieldPaths=revision&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=bundleJson`;
  const body = {
    fields: {
      version: { integerValue: String(bundle.version) },
      revision: { integerValue: String(revision) },
      updatedAt: { stringValue: new Date().toISOString() },
      bundleJson: { stringValue: JSON.stringify(bundle) },
    },
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw formatFirestoreError(res.status, text);
  }
}
