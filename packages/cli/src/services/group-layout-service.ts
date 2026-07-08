import type { GroupRepositoryPort, WorkspaceRepositoryPort } from "../core/ports/repositories.js";
import type { GroupLayoutRepository } from "../database/repositories/group-layout-repository.js";
import type { GroupLayoutMeta, GroupLayoutSnapshot } from "../models/group-layout.js";
import { AppError } from "../core/errors/app-error.js";

export class GroupLayoutService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly groups: GroupRepositoryPort,
    private readonly layouts: GroupLayoutRepository,
  ) {}

  get(workspaceId: string, groupId: string): GroupLayoutSnapshot | null {
    this.ensureGroup(workspaceId, groupId);
    return this.layouts.findByGroupId(groupId);
  }

  save(workspaceId: string, groupId: string, snapshot: GroupLayoutSnapshot): GroupLayoutSnapshot {
    this.ensureGroup(workspaceId, groupId);
    return this.layouts.upsert(groupId, workspaceId, snapshot);
  }

  getMetaMap(): Record<string, GroupLayoutMeta> {
    const map = this.layouts.listMetaByWorkspace();
    return Object.fromEntries(map.entries());
  }

  getLastActiveGroupKey(): string | null {
    return this.layouts.getLastActiveGroupKey();
  }

  setLastActiveGroup(workspaceId: string, groupId: string): void {
    this.ensureGroup(workspaceId, groupId);
    this.layouts.setLastActiveGroupKey(workspaceId, groupId);
  }

  getPreference(key: string): string | null {
    return this.layouts.getPreference(key);
  }

  setPreference(key: string, value: string): void {
    this.layouts.setPreference(key, value);
  }

  private ensureGroup(workspaceId: string, groupId: string): void {
    const workspace = this.workspaces.list().find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new AppError(`Workspace not found`, "WORKSPACE_NOT_FOUND");
    }
    const group = this.groups.listByWorkspace(workspaceId).find((g) => g.id === groupId);
    if (!group) {
      throw new AppError(`Group not found`, "GROUP_NOT_FOUND");
    }
  }
}
