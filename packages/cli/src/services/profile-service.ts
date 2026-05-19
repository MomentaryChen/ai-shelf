import type { GroupRepositoryPort, WorkspaceRepositoryPort } from "../core/ports/repositories.js";
import type { GroupLayoutRepository } from "../database/repositories/group-layout-repository.js";
import type { EventBus } from "../runtime/event-bus.js";
import type { GroupModel } from "../models/group.js";
import type { GroupLayoutSnapshot } from "../models/group-layout.js";
import { AppError } from "../core/errors/app-error.js";
import { homedir } from "node:os";
import {
  isProfileAccentColor,
  pickNextProfileAccentColor,
} from "../models/profile-colors.js";

export const PROFILES_WORKSPACE_NAME = "Profiles";
export const DEFAULT_PROFILE_TOOL = "claude";

export interface ProfileInfo {
  id: string;
  workspaceId: string;
  name: string;
  defaultCwd: string;
  defaultTool: string;
  broadcastInput: boolean;
  accentColor: string | null;
  paneCount: number;
  terminals: { tool: string; cwd: string }[];
  updatedAt: string | null;
}

export interface ProfileTree {
  workspaceId: string;
  profiles: ProfileInfo[];
  lastActiveProfileId: string | null;
}

export class ProfileService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly groups: GroupRepositoryPort,
    private readonly layouts: GroupLayoutRepository,
    private readonly eventBus: EventBus,
  ) {}

  ensureProfilesWorkspace() {
    let ws = this.workspaces.findByName(PROFILES_WORKSPACE_NAME);
    if (!ws) {
      ws = this.workspaces.create({ name: PROFILES_WORKSPACE_NAME, root_path: homedir() });
    }
    return ws;
  }

  getTree(): ProfileTree {
    const ws = this.ensureProfilesWorkspace();
    const groups = this.groups.listByWorkspace(ws.id);
    const metaMap = this.layouts.listMetaByWorkspace();
    const lastKey = this.layouts.getLastActiveGroupKey();
    let lastActiveProfileId: string | null = null;
    if (lastKey?.startsWith(`${ws.id}:`)) {
      lastActiveProfileId = lastKey.slice(ws.id.length + 1);
    }

    const profiles: ProfileInfo[] = groups.map((g) => this.toProfileInfo(g, ws.id, metaMap));

    return { workspaceId: ws.id, profiles, lastActiveProfileId };
  }

  create(
    name: string,
    defaultCwd?: string,
    defaultTool?: string,
    accentColor?: string | null,
  ): ProfileInfo {
    const ws = this.ensureProfilesWorkspace();
    const existing = this.groups.findByName(ws.id, name);
    if (existing) {
      throw new AppError(`Profile "${name}" already exists`, "PROFILE_EXISTS");
    }
    const group = this.groups.create({ workspace_id: ws.id, name });
    this.eventBus.publish({ type: "GroupCreated", payload: group });

    const cwd = defaultCwd ?? ws.root_path ?? homedir();
    const tool = defaultTool ?? DEFAULT_PROFILE_TOOL;
    const existingProfiles = this.groups.listByWorkspace(ws.id);
    const usedColors = existingProfiles.map(
      (g) => this.layouts.findByGroupId(g.id)?.accentColor ?? null,
    );
    const resolvedAccent =
      accentColor === null
        ? null
        : accentColor && isProfileAccentColor(accentColor)
          ? accentColor
          : pickNextProfileAccentColor(usedColors);
    const snapshot: GroupLayoutSnapshot = {
      defaultCwd: cwd,
      defaultTool: tool,
      panes: [],
      layout: null,
      broadcastInput: false,
      accentColor: resolvedAccent,
      updatedAt: new Date().toISOString(),
    };
    this.layouts.upsert(group.id, ws.id, snapshot);

    return this.toProfileInfo(group, ws.id);
  }

  update(
    profileId: string,
    patch: {
      defaultCwd?: string;
      defaultTool?: string;
      broadcastInput?: boolean;
      accentColor?: string | null;
    },
  ): ProfileInfo {
    const ws = this.ensureProfilesWorkspace();
    const group = this.groups.listByWorkspace(ws.id).find((g) => g.id === profileId);
    if (!group) throw new AppError("Profile not found", "PROFILE_NOT_FOUND");

    const snap =
      this.layouts.findByGroupId(profileId) ??
      ({
        defaultCwd: patch.defaultCwd ?? ws.root_path ?? homedir(),
        defaultTool: patch.defaultTool ?? DEFAULT_PROFILE_TOOL,
        panes: [],
        layout: null,
        broadcastInput: false,
        accentColor: null,
        updatedAt: new Date().toISOString(),
      } satisfies GroupLayoutSnapshot);

    let nextAccent = snap.accentColor ?? null;
    if (patch.accentColor !== undefined) {
      nextAccent =
        patch.accentColor === null
          ? null
          : isProfileAccentColor(patch.accentColor)
            ? patch.accentColor
            : nextAccent;
    }

    const next: GroupLayoutSnapshot = {
      ...snap,
      defaultCwd: patch.defaultCwd ?? snap.defaultCwd,
      defaultTool: patch.defaultTool ?? snap.defaultTool ?? DEFAULT_PROFILE_TOOL,
      broadcastInput: patch.broadcastInput ?? snap.broadcastInput ?? false,
      accentColor: nextAccent,
      updatedAt: new Date().toISOString(),
    };
    this.layouts.upsert(profileId, ws.id, next);

    return this.toProfileInfo(group, ws.id);
  }

  delete(profileId: string): void {
    const ws = this.ensureProfilesWorkspace();
    const group = this.groups.listByWorkspace(ws.id).find((g) => g.id === profileId);
    if (!group) throw new AppError("Profile not found", "PROFILE_NOT_FOUND");

    const lastKey = this.layouts.getLastActiveGroupKey();
    if (lastKey === `${ws.id}:${profileId}`) {
      this.layouts.clearLastActiveGroupKey();
    }

    this.groups.deleteByName(ws.id, group.name);
  }

  resolve(profileId: string): { workspaceId: string; group: GroupModel } {
    const ws = this.ensureProfilesWorkspace();
    const group = this.groups.listByWorkspace(ws.id).find((g) => g.id === profileId);
    if (!group) throw new AppError("Profile not found", "PROFILE_NOT_FOUND");
    return { workspaceId: ws.id, group };
  }

  private toProfileInfo(
    group: GroupModel,
    workspaceId: string,
    metaMap?: Map<string, import("../models/group-layout.js").GroupLayoutMeta>,
  ): ProfileInfo {
    const key = `${workspaceId}:${group.id}`;
    const meta = metaMap?.get(key) ?? this.layouts.listMetaByWorkspace().get(key);
    const snap = this.layouts.findByGroupId(group.id);
    const ws = this.workspaces.list().find((w) => w.id === workspaceId);
    return {
      id: group.id,
      workspaceId,
      name: group.name,
      defaultCwd: snap?.defaultCwd ?? meta?.defaultCwd ?? ws?.root_path ?? homedir(),
      defaultTool: snap?.defaultTool ?? meta?.defaultTool ?? DEFAULT_PROFILE_TOOL,
      broadcastInput: snap?.broadcastInput ?? false,
      accentColor: snap?.accentColor ?? meta?.accentColor ?? null,
      paneCount: meta?.paneCount ?? 0,
      terminals: snap?.panes ?? [],
      updatedAt: meta?.updatedAt ?? null,
    };
  }
}
