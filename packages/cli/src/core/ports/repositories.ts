import type { WorkspaceModel, CreateWorkspaceInput } from "../../models/workspace.js";
import type { GroupModel, CreateGroupInput } from "../../models/group.js";
import type { SessionModel, CreateSessionInput } from "../../models/session.js";

export interface WorkspaceRepositoryPort {
  create(input: CreateWorkspaceInput): WorkspaceModel;
  list(): WorkspaceModel[];
  findByName(name: string): WorkspaceModel | null;
  deleteByName(name: string): boolean;
}

export interface GroupRepositoryPort {
  create(input: CreateGroupInput): GroupModel;
  listByWorkspace(workspaceId: string): GroupModel[];
  findByName(workspaceId: string, name: string): GroupModel | null;
  rename(workspaceId: string, groupId: string, name: string): GroupModel;
  reorder(workspaceId: string, orderedGroupIds: string[]): void;
  deleteByName(workspaceId: string, name: string): boolean;
}

export interface SessionRepositoryPort {
  create(input: CreateSessionInput): SessionModel;
  listByGroup(workspaceId: string, groupId: string): SessionModel[];
  listByWorkspace(workspaceId: string): SessionModel[];
  findById(id: string): SessionModel | null;
  findByName(workspaceId: string, groupId: string, name: string): SessionModel | null;
  updateRuntime(
    id: string,
    patch: { pid?: number | null; status: SessionModel["status"] },
  ): SessionModel;
  deleteByName(workspaceId: string, groupId: string, name: string): boolean;
}
