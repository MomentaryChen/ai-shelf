/**
 * Which renderer (webContents id) controls a PTY session's size and input.
 *
 * Output is broadcast to every window, but only one window may resize or write
 * to a session — otherwise two windows showing the same terminal (a popped-out
 * pane and its origin) fight over cols/rows. A session with no recorded owner
 * stays open to every sender, which is how all non-popped panes behave.
 *
 * No Electron import, so it can be unit-tested with plain Node.
 */
export class PtyOwnership {
  private readonly owners = new Map<string, number>();

  /** Give `ownerId` exclusive control of the session. */
  claim(sessionId: string, ownerId: number): void {
    this.owners.set(sessionId, ownerId);
  }

  /** Drop the session's owner. With `ownerId`, only when it still owns it. */
  release(sessionId: string, ownerId?: number): void {
    if (ownerId !== undefined && this.owners.get(sessionId) !== ownerId) return;
    this.owners.delete(sessionId);
  }

  ownerOf(sessionId: string): number | null {
    return this.owners.get(sessionId) ?? null;
  }

  /** True when `senderId` may resize / write: no owner, or it is the owner. */
  canControl(sessionId: string, senderId: number): boolean {
    const owner = this.owners.get(sessionId);
    return owner === undefined || owner === senderId;
  }

  /** Release every session owned by `ownerId` (its window closed). Returns those session ids. */
  releaseAllFor(ownerId: number): string[] {
    const released: string[] = [];
    for (const [sessionId, owner] of this.owners) {
      if (owner === ownerId) released.push(sessionId);
    }
    for (const sessionId of released) this.owners.delete(sessionId);
    return released;
  }
}
