import type { ProfileForest, ProfileGroupNode } from "../types";

/**
 * Default profile-group name. Must stay aligned with
 * `DEFAULT_PROFILE_GROUP_NAME` in `packages/cli/src/services/profile-group-service.ts`.
 * Profiles created in any other workspace are copied here as
 * `${workspace} / ${profile}` (see `legacyMirrorName` in profile-service).
 */
export const DEFAULT_PROFILES_WORKSPACE_NAME = "Profiles";

type GroupWithProfiles = {
  id: string;
  name: string;
  profiles: { id: string; name: string }[];
};

/** Name of the catch-all copy stored in the default Profiles workspace. */
export function legacyMirrorProfileName(workspaceName: string, profileName: string): string {
  return `${workspaceName} / ${profileName}`;
}

/** Profile ids in the default Profiles workspace that only duplicate another workspace. */
export function legacyMirrorProfileIds(groups: readonly GroupWithProfiles[]): Set<string> {
  const bucket = groups.find((group) => group.name === DEFAULT_PROFILES_WORKSPACE_NAME);
  if (!bucket) return new Set();

  const ids = new Set<string>();
  for (const group of groups) {
    if (group.id === bucket.id) continue;
    for (const profile of group.profiles) {
      const mirrorName = legacyMirrorProfileName(group.name, profile.name);
      const mirror = bucket.profiles.find((candidate) => candidate.name === mirrorName);
      if (mirror) ids.add(mirror.id);
    }
  }
  return ids;
}

function sourceOfMirror(
  groups: readonly GroupWithProfiles[],
  bucketId: string,
  mirrorName: string,
): { groupId: string; profileId: string } | null {
  for (const group of groups) {
    if (group.id === bucketId) continue;
    for (const profile of group.profiles) {
      if (legacyMirrorProfileName(group.name, profile.name) === mirrorName) {
        return { groupId: group.id, profileId: profile.id };
      }
    }
  }
  return null;
}

/**
 * Terminal sidebar view of a profile forest.
 *
 * The default "Profiles" workspace is a compatibility bucket that mirrors every
 * profile from every other workspace. Once those workspaces exist, that list
 * is just a duplicate of everything else, so the sidebar omits the copies.
 * The workspace itself stays when it still has profiles that are not mirrors,
 * and when it is the only workspace.
 *
 * If the last-opened profile was one of those copies, focus moves to the
 * source profile in its real workspace.
 */
export function forestWithoutDefaultProfilesMirror(forest: ProfileForest): ProfileForest {
  const bucket = forest.groups.find((group) => group.name === DEFAULT_PROFILES_WORKSPACE_NAME);
  if (!bucket) return forest;

  const mirrorIds = legacyMirrorProfileIds(forest.groups);
  const keptProfiles = bucket.profiles.filter((profile) => !mirrorIds.has(profile.id));
  const hideBucket = keptProfiles.length === 0 && forest.groups.length > 1;
  if (mirrorIds.size === 0 && !hideBucket) return forest;

  const groups: ProfileGroupNode[] = [];
  for (const group of forest.groups) {
    if (group.id !== bucket.id) {
      groups.push(group);
      continue;
    }
    if (hideBucket) continue;
    groups.push({
      ...group,
      profiles: keptProfiles,
      profileCount: keptProfiles.length,
    });
  }

  let lastActiveGroupId = forest.lastActiveGroupId;
  let lastActiveProfileId = forest.lastActiveProfileId;
  const activeGroupVisible = groups.some((group) => group.id === lastActiveGroupId);
  const activeProfileVisible =
    lastActiveProfileId == null ||
    groups.some((group) => group.profiles.some((profile) => profile.id === lastActiveProfileId));

  if (!activeGroupVisible || !activeProfileVisible) {
    const removed = bucket.profiles.find((profile) => profile.id === lastActiveProfileId);
    const source =
      removed && mirrorIds.has(removed.id)
        ? sourceOfMirror(forest.groups, bucket.id, removed.name)
        : null;
    if (source && groups.some((group) => group.id === source.groupId)) {
      lastActiveGroupId = source.groupId;
      lastActiveProfileId = source.profileId;
    } else {
      const fallback = groups.find((group) => group.profiles.length > 0) ?? groups[0] ?? null;
      lastActiveGroupId = fallback?.id ?? null;
      const remembered = fallback ? forest.lastActiveByGroup[fallback.id] : undefined;
      const rememberedProfile = fallback?.profiles.find((profile) => profile.id === remembered);
      lastActiveProfileId = rememberedProfile?.id ?? fallback?.profiles[0]?.id ?? null;
    }
  }

  const lastActiveByGroup: Record<string, string> = {};
  for (const [groupId, profileId] of Object.entries(forest.lastActiveByGroup)) {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) continue;
    if (group.profiles.some((profile) => profile.id === profileId)) {
      lastActiveByGroup[groupId] = profileId;
      continue;
    }
    const first = group.profiles[0];
    if (first) lastActiveByGroup[groupId] = first.id;
  }

  return {
    ...forest,
    groups,
    lastActiveGroupId,
    lastActiveProfileId,
    lastActiveByGroup,
  };
}

/** First candidate id that still exists in the forest, otherwise the first group. */
export function preferredVisibleGroupId(
  forest: ProfileForest | null | undefined,
  candidates: readonly (string | null | undefined)[],
): string | null {
  if (!forest) return null;
  for (const id of candidates) {
    if (id && forest.groups.some((group) => group.id === id)) return id;
  }
  return forest.groups[0]?.id ?? null;
}
