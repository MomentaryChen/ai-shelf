import {
  encodeSyncLimitError,
  MAX_SYNC_REGISTERED_USERS,
} from "../../shared/sync-limits.js";
import type { SyncUserRegistryDoc } from "../../shared/sync-types.js";
import { getFirebaseApp, isFirebaseConfigured } from "./auth.js";

export const SYNC_REGISTRY_DOC_PATH = "_meta/sync-registry";

async function getRegistryRef() {
  const { getFirestore, doc } = await import("firebase/firestore");
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not initialized");
  return doc(getFirestore(app), SYNC_REGISTRY_DOC_PATH);
}

function parseRegistry(data: unknown): SyncUserRegistryDoc | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<SyncUserRegistryDoc>;
  if (typeof row.count !== "number" || !row.users || typeof row.users !== "object") return null;
  return { count: row.count, users: row.users as Record<string, string> };
}

/**
 * Register the signed-in user for cloud sync if not already listed.
 * New users are rejected when the registry is full (300).
 * Users who already have remote sync data are grandfathered into the registry.
 */
export async function ensureSyncUserRegistered(
  uid: string,
  options: { hasExistingRemoteSync: boolean },
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const { getFirestore, runTransaction } = await import("firebase/firestore");
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not initialized");
  const db = getFirestore(app);
  const ref = await getRegistryRef();
  const now = new Date().toISOString();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { count: 1, users: { [uid]: now } } satisfies SyncUserRegistryDoc);
      return;
    }

    const registry = parseRegistry(snap.data());
    if (!registry) throw new Error("Invalid sync registry document");

    if (registry.users[uid]) return;

    if (!options.hasExistingRemoteSync && registry.count >= MAX_SYNC_REGISTERED_USERS) {
      throw new Error(
        encodeSyncLimitError("user_cap_reached", {
          count: registry.count,
          maxUsers: MAX_SYNC_REGISTERED_USERS,
        }),
      );
    }

    tx.update(ref, {
      count: registry.count + 1,
      [`users.${uid}`]: now,
    });
  });
}
