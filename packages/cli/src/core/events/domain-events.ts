import type { WorkspaceModel } from "../../models/workspace.js";
import type { GroupModel } from "../../models/group.js";
import type { SessionModel } from "../../models/session.js";

export type DomainEvent =
  | { type: "WorkspaceCreated"; payload: WorkspaceModel }
  | { type: "GroupCreated"; payload: GroupModel }
  | { type: "SessionCreated"; payload: SessionModel }
  | { type: "SessionStarted"; payload: SessionModel }
  | { type: "SessionStopped"; payload: SessionModel }
  | { type: "SessionOutputReceived"; payload: { sessionId: string } };

export type DomainEventType = DomainEvent["type"];
