import type { WorkspaceRepositoryPort } from "../core/ports/repositories.js";
import type { EventBus } from "../runtime/event-bus.js";
import type { WorkspaceRuntime } from "../runtime/workspace-runtime.js";
import type { WorkspaceModel } from "../models/workspace.js";
import { AppError } from "../core/errors/app-error.js";

export class WorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly eventBus: EventBus,
    private readonly workspaceRuntime: WorkspaceRuntime,
  ) {}

  create(name: string, rootPath?: string): WorkspaceModel {
    const existing = this.workspaces.findByName(name);
    if (existing) {
      throw new AppError(`Workspace "${name}" already exists`, "WORKSPACE_EXISTS");
    }

    const workspace = this.workspaces.create({ name, root_path: rootPath });
    this.eventBus.publish({ type: "WorkspaceCreated", payload: workspace });
    this.workspaceRuntime.activate(workspace);
    return workspace;
  }

  list(): WorkspaceModel[] {
    return this.workspaces.list();
  }

  getByName(name: string): WorkspaceModel {
    const ws = this.workspaces.findByName(name);
    if (!ws) throw new AppError(`Workspace "${name}" not found`, "WORKSPACE_NOT_FOUND");
    return ws;
  }

  delete(name: string): void {
    const deleted = this.workspaces.deleteByName(name);
    if (!deleted) throw new AppError(`Workspace "${name}" not found`, "WORKSPACE_NOT_FOUND");
  }
}
