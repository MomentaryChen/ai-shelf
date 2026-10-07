/**
 * Decisions the renderer makes after `pty-attach` returns.
 *
 * Kept pure so remount / wake / respawn rules stay unit-tested without Electron.
 */

export type PtyAttachAliveInfo = {
  exitCode: number | null;
  shell: string | null;
  pid: number | null;
};

/**
 * True when the session id vanished without any meta — e.g. main lost the map
 * entry. A clean exit or kill leaves shell / pid / exitCode so the pane can
 * show history and stay dead instead of auto-respawning on remount.
 */
export function shouldRespawnLostSession(info: PtyAttachAliveInfo): boolean {
  return info.exitCode == null && info.shell == null && info.pid == null;
}

/**
 * Auto-Enter after attach is only safe for plain shells. AI CLIs may treat a
 * premature CR as submit before the first prompt paints.
 */
export function shouldWakeShellWithEnter(sessionId: string): boolean {
  return sessionId.startsWith("shell-");
}
