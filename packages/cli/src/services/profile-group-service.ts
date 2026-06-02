import type { WorkspaceRepositoryPort } from "../core/ports/repositories.js";
import type { GroupLayoutRepository } from "../database/repositories/group-layout-repository.js";
import type { EventBus } from "../runtime/event-bus.js";
import type { WorkspaceModel } from "../models/workspace.js";
import { AppError } from "../core/errors/app-error.js";
import { homedir } from "node:os";

/** Default profile group name for new installs and legacy data. */
export const DEFAULT_PROFILE_GROUP_NAME = "Profiles";

export interface ProfileGroupInfo {
  id: string;
  name: string;
  profileCount: number;
  updatedAt: string | null;
}

export class ProfileGroupService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly layouts: GroupLayoutRepository,
    private readonly eventBus: EventBus,
  ) {}

  ensureDefaultGroup(): WorkspaceModel {
    const list = this.workspaces.list();
    if (list.length > 0) return list[0]!;
    const ws = this.workspaces.create({ name: DEFAULT_PROFILE_GROUP_NAME, root_path: homedir() });
    this.eventBus.publish({ type: "WorkspaceCreated", payload: ws });
    return ws;
  }

  list(): ProfileGroupInfo[] {
    this.ensureDefaultGroup();
    const metaMap = this.layouts.listMetaByWorkspace();
    return this.workspaces.list().map((ws) => this.toGroupInfo(ws, metaMap));
  }

  create(name: string): ProfileGroupInfo {
    const trimmed = name.trim();
    if (!trimmed) throw new AppError("Profile group name is required", "INVALID_PROFILE_GROUP_NAME");
    const existing = this.workspaces.findByName(trimmed);
    if (existing) {
      throw new AppError(`Profile group "${trimmed}" already exists`, "PROFILE_GROUP_EXISTS");
    }
    const ws = this.workspaces.create({ name: trimmed });
    this.eventBus.publish({ type: "WorkspaceCreated", payload: ws });
    return this.toGroupInfo(ws, this.layouts.listMetaByWorkspace());
  }

  rename(idOrName: string, newName: string): ProfileGroupInfo {
    const ws = this.resolve(idOrName);
    const trimmed = newName.trim();
    if (!trimmed) throw new AppError("Profile group name is required", "INVALID_PROFILE_GROUP_NAME");
    if (trimmed !== ws.name) {
      const conflict = this.workspaces.findByName(trimmed);
      if (conflict && conflict.id !== ws.id) {
        throw new AppError(`Profile group "${trimmed}" already exists`, "PROFILE_GROUP_EXISTS");
      }
      this.workspaces.rename(ws.id, trimmed);
    }
    const updated = this.workspaces.findById(ws.id)!;
    return this.toGroupInfo(updated, this.layouts.listMetaByWorkspace());
  }

  reorder(orderedGroupIds: string[]): ProfileGroupInfo[] {
    const all = this.workspaces.list();
    if (orderedGroupIds.length !== all.length) {
      throw new AppError("Reorder list must include every profile group", "INVALID_PROFILE_GROUP_ORDER");
    }
    const known = new Set(all.map((w) => w.id));
    for (const id of orderedGroupIds) {
      if (!known.has(id)) {
        throw new AppError("Unknown profile group in reorder list", "INVALID_PROFILE_GROUP_ORDER");
      }
    }
    this.workspaces.reorder(orderedGroupIds);
    return this.list();
  }

  delete(idOrName: string): void {
    const all = this.workspaces.list();
    if (all.length <= 1) {
      throw new AppError("Cannot delete the last profile group", "PROFILE_GROUP_LAST");
    }
    const ws = this.resolve(idOrName);
    const lastKey = this.layouts.getLastActiveGroupKey();
    if (lastKey?.startsWith(`${ws.id}:`)) {
      this.layouts.clearLastActiveGroupKey();
    }
    const deleted = this.workspaces.deleteById(ws.id);
    if (!deleted) throw new AppError("Profile group not found", "PROFILE_GROUP_NOT_FOUND");
  }

  resolve(idOrName: string): WorkspaceModel {
    this.ensureDefaultGroup();
    const byId = this.workspaces.findById(idOrName);
    if (byId) return byId;
    const byName = this.workspaces.findByName(idOrName);
    if (byName) return byName;
    throw new AppError(`Profile group "${idOrName}" not found`, "PROFILE_GROUP_NOT_FOUND");
  }

  private toGroupInfo(
    ws: WorkspaceModel,
    metaMap: Map<string, import("../models/group-layout.js").GroupLayoutMeta>,
  ): ProfileGroupInfo {
    let profileCount = 0;
    let updatedAt: string | null = null;
    for (const [key, meta] of metaMap) {
      if (!key.startsWith(`${ws.id}:`)) continue;
      profileCount += 1;
      if (meta.updatedAt && (!updatedAt || meta.updatedAt > updatedAt)) {
        updatedAt = meta.updatedAt;
      }
    }
    return { id: ws.id, name: ws.name, profileCount, updatedAt };
  }
}
