/** Public user fields safe to show in UI and share with the main process. */
export interface AuthUserPublic {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Renderer → main: session snapshot after Google sign-in or token refresh. */
export interface AuthSessionReport {
  signedIn: boolean;
  user: AuthUserPublic | null;
  idToken: string | null;
  idTokenExpiresAt: number | null;
}

/** Main → renderer: auth state without secrets. */
export interface AuthStatePublic {
  configured: boolean;
  signedIn: boolean;
  user: AuthUserPublic | null;
}
