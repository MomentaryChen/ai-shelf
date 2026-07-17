import type {
  GroupRepositoryPort,
  SessionRepositoryPort,
  WorkspaceRepositoryPort,
} from "../core/ports/repositories.js";
import type { EventBus } from "../runtime/event-bus.js";
import type { SessionRuntime } from "../runtime/session-runtime.js";
import type { SessionModel } from "../models/session.js";
import { AppError } from "../core/errors/app-error.js";
import { homedir } from "node:os";

export class SessionService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly groups: GroupRepositoryPort,
    private readonly sessions: SessionRepositoryPort,
    private readonly eventBus: EventBus,
    private readonly sessionRuntime: SessionRuntime,
    private readonly defaultShell: string = "auto",
  ) {}

  async create(
    workspaceName: string,
    groupName: string,
    sessionName: string,
    options?: { cwd?: string; shell?: string; tool?: string; start?: boolean },
  ): Promise<SessionModel> {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) {
      throw new AppError(`Workspace "${workspaceName}" not found`, "WORKSPACE_NOT_FOUND");
    }

    const group = this.groups.findByName(workspace.id, groupName);
    if (!group) {
      throw new AppError(`Group "${groupName}" not found`, "GROUP_NOT_FOUND");
    }

    const existing = this.sessions.findByName(workspace.id, group.id, sessionName);
    if (existing) {
      throw new AppError(`Session "${sessionName}" already exists`, "SESSION_EXISTS");
    }

    const cwd = options?.cwd ?? workspace.root_path ?? homedir();
    const session = this.sessions.create({
      workspace_id: workspace.id,
      group_id: group.id,
      name: sessionName,
      cwd,
      shell: options?.shell ?? this.defaultShell,
      tool: options?.tool,
    });

    this.eventBus.publish({ type: "SessionCreated", payload: session });

    if (options?.start !== false) {
      await this.sessionRuntime.start(session, options?.tool);
    }

    return this.sessions.findById(session.id) ?? session;
  }

  async start(
    workspaceName: string,
    groupName: string,
    sessionName: string,
  ): Promise<SessionModel> {
    const session = this.resolveSession(workspaceName, groupName, sessionName);
    await this.sessionRuntime.start(session, session.tool ?? undefined);
    return this.sessions.findById(session.id) ?? session;
  }

  stop(workspaceName: string, groupName: string, sessionName: string): SessionModel {
    const session = this.resolveSession(workspaceName, groupName, sessionName);
    this.sessionRuntime.stop(session.id);
    return this.sessions.findById(session.id) ?? session;
  }

  list(workspaceName: string, groupName?: string): SessionModel[] {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) {
      throw new AppError(`Workspace "${workspaceName}" not found`, "WORKSPACE_NOT_FOUND");
    }

    if (!groupName) {
      return this.sessions.listByWorkspace(workspace.id);
    }

    const group = this.groups.findByName(workspace.id, groupName);
    if (!group) {
      throw new AppError(`Group "${groupName}" not found`, "GROUP_NOT_FOUND");
    }
    return this.sessions.listByGroup(workspace.id, group.id);
  }

  resolveSession(
    workspaceName: string,
    groupName: string,
    sessionName: string,
  ): SessionModel {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) {
      throw new AppError(`Workspace "${workspaceName}" not found`, "WORKSPACE_NOT_FOUND");
    }
    const group = this.groups.findByName(workspace.id, groupName);
    if (!group) {
      throw new AppError(`Group "${groupName}" not found`, "GROUP_NOT_FOUND");
    }
    const session = this.sessions.findByName(workspace.id, group.id, sessionName);
    if (!session) {
      throw new AppError(`Session "${sessionName}" not found`, "SESSION_NOT_FOUND");
    }
    return session;
  }

  stopAllInWorkspace(workspaceName: string): void {
    const workspace = this.workspaces.findByName(workspaceName);
    if (!workspace) return;
    const groups = this.groups.listByWorkspace(workspace.id);
    for (const group of groups) {
      for (const session of this.sessions.listByGroup(workspace.id, group.id)) {
        if (session.status === "running") {
          try {
            this.sessionRuntime.stop(session.id);
          } catch {
            /* already stopped */
          }
        }
      }
    }
  }

  delete(workspaceName: string, groupName: string, sessionName: string): void {
    const session = this.resolveSession(workspaceName, groupName, sessionName);
    try {
      this.sessionRuntime.stop(session.id);
    } catch {
      /* not running */
    }
    const workspace = this.workspaces.findByName(workspaceName)!;
    const group = this.groups.findByName(workspace.id, groupName)!;
    const deleted = this.sessions.deleteByName(workspace.id, group.id, sessionName);
    if (!deleted) throw new AppError(`Session "${sessionName}" not found`, "SESSION_NOT_FOUND");
  }

  getTree(): {
    workspaces: ReturnType<WorkspaceRepositoryPort["list"]>;
    groups: Map<string, ReturnType<GroupRepositoryPort["listByWorkspace"]>>;
    sessions: Map<string, SessionModel[]>;
  } {
    const workspaces = this.workspaces.list();
    const groups = new Map<string, ReturnType<GroupRepositoryPort["listByWorkspace"]>>();
    const sessions = new Map<string, SessionModel[]>();

    for (const ws of workspaces) {
      groups.set(ws.id, this.groups.listByWorkspace(ws.id));
      sessions.set(ws.id, this.sessions.listByWorkspace(ws.id));
    }

    return { workspaces, groups, sessions };
  }
}
