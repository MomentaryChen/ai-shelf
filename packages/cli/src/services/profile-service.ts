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
import {
  DEFAULT_PROFILE_GROUP_NAME,
  type ProfileGroupInfo,
} from "./profile-group-service.js";

/** @deprecated Use DEFAULT_PROFILE_GROUP_NAME */
export const PROFILES_WORKSPACE_NAME = DEFAULT_PROFILE_GROUP_NAME;
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

export interface ProfileGroupNode extends ProfileGroupInfo {
  profiles: ProfileInfo[];
}

export interface ProfileForest {
  groups: ProfileGroupNode[];
  lastActiveGroupId: string | null;
  lastActiveProfileId: string | null;
}

/** @deprecated Use ProfileForest */
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProfileService {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly groups: GroupRepositoryPort,
    private readonly layouts: GroupLayoutRepository,
    private readonly eventBus: EventBus,
  ) {}

  ensureDefaultGroup() {
    let list = this.workspaces.list();
    if (list.length === 0) {
      const ws = this.workspaces.create({
        name: DEFAULT_PROFILE_GROUP_NAME,
        root_path: homedir(),
      });
      list = [ws];
    }
    return list[0]!;
  }

  private ensureLegacyWorkspace() {
    const byName = this.workspaces.findByName(DEFAULT_PROFILE_GROUP_NAME);
    if (byName) return byName;
    return this.workspaces.create({
      name: DEFAULT_PROFILE_GROUP_NAME,
      root_path: homedir(),
    });
  }

  private legacyMirrorName(sourceWorkspaceName: string, profileName: string): string {
    return `${sourceWorkspaceName} / ${profileName}`;
  }

  private upsertLegacyMirror(
    sourceWorkspaceName: string,
    profileName: string,
    snapshot: GroupLayoutSnapshot,
  ): void {
    if (sourceWorkspaceName === DEFAULT_PROFILE_GROUP_NAME) return;
    const legacyWs = this.ensureLegacyWorkspace();
    const mirrorName = this.legacyMirrorName(sourceWorkspaceName, profileName);
    const existing = this.groups.findByName(legacyWs.id, mirrorName);
    const mirror =
      existing ?? this.groups.create({ workspace_id: legacyWs.id, name: mirrorName });
    this.layouts.upsert(mirror.id, legacyWs.id, {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    });
  }

  private deleteLegacyMirror(sourceWorkspaceName: string, profileName: string): void {
    if (sourceWorkspaceName === DEFAULT_PROFILE_GROUP_NAME) return;
    const legacyWs = this.workspaces.findByName(DEFAULT_PROFILE_GROUP_NAME);
    if (!legacyWs) return;
    const mirrorName = this.legacyMirrorName(sourceWorkspaceName, profileName);
    const existing = this.groups.findByName(legacyWs.id, mirrorName);
    if (!existing) return;
    this.groups.deleteByName(legacyWs.id, mirrorName);
  }

  getForest(): ProfileForest {
    const workspaceList = this.workspaces.list();
    if (workspaceList.length === 0) {
      this.ensureDefaultGroup();
    }
    const metaMap = this.layouts.listMetaByWorkspace();
    const lastKey = this.layouts.getLastActiveGroupKey();
    let lastActiveGroupId: string | null = null;
    let lastActiveProfileId: string | null = null;
    if (lastKey) {
      const colon = lastKey.indexOf(":");
      if (colon > 0) {
        lastActiveGroupId = lastKey.slice(0, colon);
        lastActiveProfileId = lastKey.slice(colon + 1);
      }
    }

    const groups: ProfileGroupNode[] = this.workspaces.list().map((ws) => {
      const groupRows = this.groups.listByWorkspace(ws.id);
      const profiles = groupRows.map((g) => this.toProfileInfo(g, ws.id, metaMap));
      let updatedAt: string | null = null;
      for (const p of profiles) {
        if (p.updatedAt && (!updatedAt || p.updatedAt > updatedAt)) updatedAt = p.updatedAt;
      }
      return {
        id: ws.id,
        name: ws.name,
        profileCount: profiles.length,
        updatedAt,
        profiles,
      };
    });

    return { groups, lastActiveGroupId, lastActiveProfileId };
  }

  /** @deprecated Use getForest() */
  getTree(): ProfileTree {
    const forest = this.getForest();
    const defaultGroup =
      forest.groups.find((g) => g.name === DEFAULT_PROFILE_GROUP_NAME) ?? forest.groups[0];
    if (!defaultGroup) {
      const ws = this.ensureDefaultGroup();
      return { workspaceId: ws.id, profiles: [], lastActiveProfileId: null };
    }
    const lastActiveProfileId =
      defaultGroup.id === forest.lastActiveGroupId
        ? forest.lastActiveProfileId
        : null;
    return {
      workspaceId: defaultGroup.id,
      profiles: defaultGroup.profiles,
      lastActiveProfileId,
    };
  }

  create(groupIdOrName: string, name: string, input: CreateProfileInput = {}): ProfileInfo {
    const ws = this.resolveGroup(groupIdOrName);
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
    this.upsertLegacyMirror(ws.name, name, snapshot);

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
    const { workspaceId, group } = this.resolve(profileId);
    const ws = this.workspaces.findById(workspaceId)!;
    const previousName = group.name;
    let updatedGroup = group;

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new AppError("Profile name is required", "INVALID_PROFILE_NAME");
      if (trimmed !== group.name) {
        updatedGroup = this.groups.rename(workspaceId, profileId, trimmed);
      }
    }

    const snap =
      this.layouts.findByGroupId(profileId) ??
      ({
        defaultCwd: patch.defaultCwd ?? ws?.root_path ?? homedir(),
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
    this.layouts.upsert(profileId, workspaceId, next);
    if (ws.name !== DEFAULT_PROFILE_GROUP_NAME) {
      if (previousName !== updatedGroup.name) {
        this.deleteLegacyMirror(ws.name, previousName);
      }
      this.upsertLegacyMirror(ws.name, updatedGroup.name, next);
    }

    return this.toProfileInfo(updatedGroup, workspaceId);
  }

  reorder(groupIdOrName: string, orderedProfileIds: string[]): ProfileForest {
    const ws = this.resolveGroup(groupIdOrName);
    const groupRows = this.groups.listByWorkspace(ws.id);
    if (orderedProfileIds.length !== groupRows.length) {
      throw new AppError("Reorder list must include every profile", "INVALID_PROFILE_ORDER");
    }
    const known = new Set(groupRows.map((g) => g.id));
    for (const id of orderedProfileIds) {
      if (!known.has(id)) {
        throw new AppError("Unknown profile in reorder list", "INVALID_PROFILE_ORDER");
      }
    }
    this.groups.reorder(ws.id, orderedProfileIds);
    return this.getForest();
  }

  delete(profileId: string): void {
    const { workspaceId, group } = this.resolve(profileId);
    const ws = this.workspaces.findById(workspaceId)!;

    const lastKey = this.layouts.getLastActiveGroupKey();
    if (lastKey === `${workspaceId}:${profileId}`) {
      this.layouts.clearLastActiveGroupKey();
    }

    this.groups.deleteByName(workspaceId, group.name);
    this.deleteLegacyMirror(ws.name, group.name);
  }

  resolve(profileId: string): { workspaceId: string; group: GroupModel } {
    for (const ws of this.workspaces.list()) {
      const group = this.groups.listByWorkspace(ws.id).find((g) => g.id === profileId);
      if (group) return { workspaceId: ws.id, group };
    }
    throw new AppError("Profile not found", "PROFILE_NOT_FOUND");
  }

  resolveByName(groupIdOrName: string, profileName: string): ProfileInfo {
    const ws = this.resolveGroup(groupIdOrName);
    const group = this.groups.findByName(ws.id, profileName);
    if (!group) {
      throw new AppError(`Profile "${profileName}" not found`, "PROFILE_NOT_FOUND");
    }
    return this.toProfileInfo(group, ws.id);
  }

  findProfile(idOrName: string, groupIdOrName?: string): ProfileInfo {
    if (UUID_RE.test(idOrName)) {
      const { workspaceId, group } = this.resolve(idOrName);
      return this.toProfileInfo(group, workspaceId);
    }
    if (!groupIdOrName) {
      const matches: ProfileInfo[] = [];
      for (const ws of this.workspaces.list()) {
        const g = this.groups.findByName(ws.id, idOrName);
        if (g) matches.push(this.toProfileInfo(g, ws.id));
      }
      if (matches.length === 1) return matches[0]!;
      if (matches.length > 1) {
        throw new AppError(
          `Profile "${idOrName}" exists in multiple groups; use --group`,
          "PROFILE_AMBIGUOUS",
        );
      }
      throw new AppError(`Profile "${idOrName}" not found`, "PROFILE_NOT_FOUND");
    }
    return this.resolveByName(groupIdOrName, idOrName);
  }

  resolveGroup(idOrName: string) {
    if (UUID_RE.test(idOrName)) {
      const ws = this.workspaces.findById(idOrName);
      if (ws) return ws;
    }
    const byName = this.workspaces.findByName(idOrName);
    if (byName) return byName;
    throw new AppError(`Profile group "${idOrName}" not found`, "PROFILE_GROUP_NOT_FOUND");
  }

  defaultGroupIdOrName(): string {
    const forest = this.getForest();
    if (forest.lastActiveGroupId) {
      const active = forest.groups.find((g) => g.id === forest.lastActiveGroupId);
      if (active) return active.id;
    }
    const named = forest.groups.find((g) => g.name === DEFAULT_PROFILE_GROUP_NAME);
    return named?.id ?? forest.groups[0]?.id ?? DEFAULT_PROFILE_GROUP_NAME;
  }

  private toProfileInfo(
    group: GroupModel,
    workspaceId: string,
    metaMap?: Map<string, import("../models/group-layout.js").GroupLayoutMeta>,
  ): ProfileInfo {
    const key = `${workspaceId}:${group.id}`;
    const meta = metaMap?.get(key) ?? this.layouts.listMetaByWorkspace().get(key);
    const snap = this.layouts.findByGroupId(group.id);
    const ws = this.workspaces.findById(workspaceId);
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
