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
  terminals: { tool: string; cwd: string; title?: string }[];
  updatedAt: string | null;
}

export interface ProfileTree {
  workspaceId: string;
  profiles: ProfileInfo[];
  lastActiveProfileId: string | null;
}

export interface CreateProfileInput {
  defaultCwd?: string;
  defaultTool?: string;
  accentColor?: string | null;
  broadcastInput?: boolean;
  copyFromProfileId?: string;
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

  create(name: string, input: CreateProfileInput = {}): ProfileInfo {
    const ws = this.ensureProfilesWorkspace();
    const existing = this.groups.findByName(ws.id, name);
    if (existing) {
      throw new AppError(`Profile "${name}" already exists`, "PROFILE_EXISTS");
    }

    let source: ProfileInfo | null = null;
    if (input.copyFromProfileId) {
      const resolved = this.resolve(input.copyFromProfileId);
      source = this.toProfileInfo(resolved.group, resolved.workspaceId);
    }

    const group = this.groups.create({ workspace_id: ws.id, name });
    this.eventBus.publish({ type: "GroupCreated", payload: group });

    const cwd =
      input.defaultCwd ?? source?.defaultCwd ?? ws.root_path ?? homedir();
    const tool =
      input.defaultTool ?? source?.defaultTool ?? DEFAULT_PROFILE_TOOL;
    const broadcastInput =
      input.broadcastInput ?? source?.broadcastInput ?? false;
    const accentColor =
      input.accentColor !== undefined ? input.accentColor : source?.accentColor;

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
      broadcastInput,
      accentColor: resolvedAccent,
      updatedAt: new Date().toISOString(),
    };
    this.layouts.upsert(group.id, ws.id, snapshot);

    return this.toProfileInfo(group, ws.id);
  }

  update(
    profileId: string,
    patch: {
      name?: string;
      defaultCwd?: string;
      defaultTool?: string;
      broadcastInput?: boolean;
      accentColor?: string | null;
    },
  ): ProfileInfo {
    const ws = this.ensureProfilesWorkspace();
    let group = this.groups.listByWorkspace(ws.id).find((g) => g.id === profileId);
    if (!group) throw new AppError("Profile not found", "PROFILE_NOT_FOUND");

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new AppError("Profile name is required", "INVALID_PROFILE_NAME");
      if (trimmed !== group.name) {
        group = this.groups.rename(ws.id, profileId, trimmed);
      }
    }

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

    const prevDefaultCwd = snap.defaultCwd;
    const nextDefaultCwd =
      patch.defaultCwd !== undefined ? patch.defaultCwd : snap.defaultCwd;
    const defaultCwdChanged =
      patch.defaultCwd !== undefined && patch.defaultCwd !== prevDefaultCwd;
    const panes = defaultCwdChanged
      ? snap.panes.map((slot) => ({
          ...slot,
          cwd: !slot.cwd || slot.cwd === prevDefaultCwd ? "" : slot.cwd,
        }))
      : snap.panes;

    const next: GroupLayoutSnapshot = {
      ...snap,
      defaultCwd: nextDefaultCwd,
      defaultTool:
        patch.defaultTool !== undefined ? patch.defaultTool : (snap.defaultTool ?? DEFAULT_PROFILE_TOOL),
      broadcastInput:
        patch.broadcastInput !== undefined ? patch.broadcastInput : (snap.broadcastInput ?? false),
      accentColor: nextAccent,
      panes,
      updatedAt: new Date().toISOString(),
    };
    this.layouts.upsert(profileId, ws.id, next);

    return this.toProfileInfo(group, ws.id);
  }

  reorder(orderedProfileIds: string[]): ProfileTree {
    const ws = this.ensureProfilesWorkspace();
    const groups = this.groups.listByWorkspace(ws.id);
    if (orderedProfileIds.length !== groups.length) {
      throw new AppError("Reorder list must include every profile", "INVALID_PROFILE_ORDER");
    }
    const known = new Set(groups.map((g) => g.id));
    for (const id of orderedProfileIds) {
      if (!known.has(id)) {
        throw new AppError("Unknown profile in reorder list", "INVALID_PROFILE_ORDER");
      }
    }
    this.groups.reorder(ws.id, orderedProfileIds);
    return this.getTree();
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
