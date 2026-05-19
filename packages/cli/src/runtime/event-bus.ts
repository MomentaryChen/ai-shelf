import { Subject, type Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import type { DomainEvent, DomainEventType } from "../core/events/domain-events.js";

export class EventBus {
  private readonly subject = new Subject<DomainEvent>();

  publish(event: DomainEvent): void {
    this.subject.next(event);
  }

  on<T extends DomainEventType>(
    type: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void,
  ): Subscription {
    return this.subject
      .pipe(filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type))
      .subscribe(handler);
  }

  onAll(handler: (event: DomainEvent) => void): Subscription {
    return this.subject.subscribe(handler);
  }
}
