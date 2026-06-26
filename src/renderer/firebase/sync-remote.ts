import type { CloudSyncStateDoc, SyncBundle } from "../../shared/sync-types.js";
import { getFirebaseApp, isFirebaseConfigured } from "./auth.js";

async function stateRef(uid: string) {
  const { getFirestore, doc } = await import("firebase/firestore");
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase not initialized");
  const db = getFirestore(app);
  return doc(db, "users", uid, "sync", "state");
}

export async function pullRemoteSyncState(uid: string): Promise<CloudSyncStateDoc | null> {
  if (!isFirebaseConfigured()) return null;
  const { getDoc } = await import("firebase/firestore");
  const snap = await getDoc(await stateRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data() as CloudSyncStateDoc;
  if (!data?.bundle || typeof data.revision !== "number") return null;
  return data;
}

export async function pushRemoteSyncState(
  uid: string,
  bundle: SyncBundle,
  revision: number,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const { setDoc } = await import("firebase/firestore");
  const payload: CloudSyncStateDoc = {
    version: bundle.version,
    revision,
    updatedAt: new Date().toISOString(),
    bundle,
  };
  await setDoc(await stateRef(uid), payload);
}
