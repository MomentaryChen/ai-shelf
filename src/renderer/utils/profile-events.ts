/** Dispatched on `window` when profile groups change outside ChatTab (e.g. onboarding). */
export const PROFILES_CHANGED_EVENT = "ai-shelf-profiles-changed";

export function notifyProfilesChanged(): void {
  window.dispatchEvent(new Event(PROFILES_CHANGED_EVENT));
}
