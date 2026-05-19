import type { Subscription } from "rxjs";
import type { AppContext } from "../../infra/bootstrap.js";
import type { DomainEvent } from "../../core/events/domain-events.js";

export interface RefreshCallbacks {
  onTick: () => void;
  onEvent?: (event: DomainEvent) => void;
}

/** Periodic + event-driven refresh for TUI panels. */
export class RefreshCoordinator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private subs: Subscription[] = [];

  start(ctx: AppContext, callbacks: RefreshCallbacks, intervalMs = 500): void {
    this.stop();
    this.timer = setInterval(() => callbacks.onTick(), intervalMs);

    if (callbacks.onEvent) {
      const handler = callbacks.onEvent;
      this.subs.push(
        ctx.eventBus.on("SessionStarted", handler),
        ctx.eventBus.on("SessionStopped", handler),
        ctx.eventBus.on("SessionOutputReceived", handler),
        ctx.eventBus.on("SessionCreated", handler),
        ctx.eventBus.on("WorkspaceCreated", handler),
        ctx.eventBus.on("GroupCreated", handler),
      );
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.subs) s.unsubscribe();
    this.subs = [];
  }
}
