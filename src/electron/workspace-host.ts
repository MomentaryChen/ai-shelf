import { bootstrap, type AppContext, type GroupLayoutSnapshot } from "ai-shelf";

let ctx: AppContext | null = null;

export function getWorkspaceContext(): AppContext {
  if (!ctx) ctx = bootstrap();
  return ctx;
}

export function closeWorkspaceContext(): void {
  ctx?.close();
  ctx = null;
}

export function getWorkspaceTree() {
  const { sessionService, groupLayoutService } = getWorkspaceContext();
  const { workspaces, groups, sessions } = sessionService.getTree();

  return {
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      root_path: w.root_path,
    })),
    groups: Object.fromEntries(
      [...groups.entries()].map(([wsId, list]) => [
        wsId,
        list.map((g) => ({ id: g.id, workspace_id: g.workspace_id, name: g.name })),
      ]),
    ),
    sessions: Object.fromEntries(
      [...sessions.entries()].map(([wsId, list]) => [
        wsId,
        list.map((s) => ({
          id: s.id,
          workspace_id: s.workspace_id,
          group_id: s.group_id,
          name: s.name,
          cwd: s.cwd,
          shell: s.shell,
          tool: s.tool,
          pid: s.pid,
          status: s.status,
        })),
      ]),
    ),
    groupLayouts: groupLayoutService.getMetaMap(),
    lastActiveGroupKey: groupLayoutService.getLastActiveGroupKey(),
  };
}

export function getGroupLayout(workspaceId: string, groupId: string) {
  return getWorkspaceContext().groupLayoutService.get(workspaceId, groupId);
}

export function saveGroupLayout(workspaceId: string, groupId: string, snapshot: GroupLayoutSnapshot) {
  return getWorkspaceContext().groupLayoutService.save(workspaceId, groupId, snapshot);
}

export function setLastActiveGroup(workspaceId: string, groupId: string) {
  getWorkspaceContext().groupLayoutService.setLastActiveGroup(workspaceId, groupId);
}

export function getProfileTree() {
  return getWorkspaceContext().profileService.getTree();
}

export function createProfile(
  name: string,
  defaultCwd?: string,
  defaultTool?: string,
  accentColor?: string | null,
) {
  return getWorkspaceContext().profileService.create(name, defaultCwd, defaultTool, accentColor);
}

export function updateProfile(
  profileId: string,
  patch: {
    name?: string;
    defaultCwd?: string;
    defaultTool?: string;
    broadcastInput?: boolean;
    accentColor?: string | null;
  },
) {
  return getWorkspaceContext().profileService.update(profileId, patch);
}

export function deleteProfile(profileId: string) {
  getWorkspaceContext().profileService.delete(profileId);
}

export function reorderProfiles(orderedProfileIds: string[]) {
  return getWorkspaceContext().profileService.reorder(orderedProfileIds);
}
