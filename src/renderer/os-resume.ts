/** Fired in this window after the OS wakes, the screen unlocks, or the GPU process resets. */
export const OS_RESUME_EVENT = "aishelf-os-resume";

/** One IPC subscription per window; terminals listen for the DOM event. */
export function installOsResumeBridge(): () => void {
  if (!window.api?.onOsResume) return () => {};
  return window.api.onOsResume(() => {
    window.dispatchEvent(new Event(OS_RESUME_EVENT));
  });
}
