import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import type { CloudSyncStateDoc, SyncBundle } from "../../shared/sync-types.js";
import { getApp } from "firebase/app";
import { isFirebaseConfigured } from "./config.js";

function stateRef(uid: string) {
  const app = getApp();
  const db = getFirestore(app);
  return doc(db, "users", uid, "sync", "state");
}

export async function pullRemoteSyncState(uid: string): Promise<CloudSyncStateDoc | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(stateRef(uid));
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
  const payload: CloudSyncStateDoc = {
    version: bundle.version,
    revision,
    updatedAt: new Date().toISOString(),
    bundle,
  };
  await setDoc(stateRef(uid), payload);
}
