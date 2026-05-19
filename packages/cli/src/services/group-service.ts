import type { GroupRepositoryPort, WorkspaceRepositoryPort } from "../core/ports/repositories.js";
import type { EventBus } from "../runtime/event-bus.js";
import type { GroupModel } from "../models/group.js";
import { AppError } from "../core/errors/app-error.js";

export class GroupService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly groups: GroupRepositoryPort,
    private readonly eventBus: EventBus,
  ) {}

  create(workspaceName: string, groupName: string): GroupModel {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) {
      throw new AppError(`Workspace "${workspaceName}" not found`, "WORKSPACE_NOT_FOUND");
    }

    const existing = this.groups.findByName(workspace.id, groupName);
    if (existing) {
      throw new AppError(`Group "${groupName}" already exists`, "GROUP_EXISTS");
    }

    const group = this.groups.create({ workspace_id: workspace.id, name: groupName });
    this.eventBus.publish({ type: "GroupCreated", payload: group });
    return group;
  }

  list(workspaceName: string): GroupModel[] {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) {
      throw new AppError(`Workspace "${workspaceName}" not found`, "WORKSPACE_NOT_FOUND");
    }
    return this.groups.listByWorkspace(workspace.id);
  }

  delete(workspaceName: string, groupName: string): void {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) {
      throw new AppError(`Workspace "${workspaceName}" not found`, "WORKSPACE_NOT_FOUND");
    }
    const deleted = this.groups.deleteByName(workspace.id, groupName);
    if (!deleted) throw new AppError(`Group "${groupName}" not found`, "GROUP_NOT_FOUND");
  }
}
