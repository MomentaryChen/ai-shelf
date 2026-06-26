export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function readEnv(key: string): string {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getFirebaseConfig(): FirebaseClientConfig | null {
  const apiKey = readEnv("VITE_FIREBASE_API_KEY");
  const authDomain = readEnv("VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = readEnv("VITE_FIREBASE_PROJECT_ID");
  const appId = readEnv("VITE_FIREBASE_APP_ID");
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const storageBucket = readEnv("VITE_FIREBASE_STORAGE_BUCKET");
  const messagingSenderId = readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID");

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}
