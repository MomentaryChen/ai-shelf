import type { WorkspaceModel } from "../models/workspace.js";

/** Workspace-level runtime coordinator (Phase 1 skeleton). */
export class WorkspaceRuntime {
  private activeWorkspaceId: string | null = null;

  activate(workspace: WorkspaceModel): void {
    this.activeWorkspaceId = workspace.id;
  }

  getActiveWorkspaceId(): string | null {
    return this.activeWorkspaceId;
  }
}
