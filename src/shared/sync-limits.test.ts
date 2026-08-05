import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SYNC_LAYOUTS, MAX_SYNC_PROFILES, validateSyncBundle } from "./sync-limits.js";
import { SYNC_BUNDLE_VERSION, type SyncBundle, type SyncProfile } from "./sync-types.js";

function makeProfile(index: number): SyncProfile {
  return {
    id: `p${index}`,
    workspaceId: "ws",
    name: `Profile ${index}`,
    sortOrder: index,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function bundleWithProfiles(count: number): SyncBundle {
  return {
    version: SYNC_BUNDLE_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    deviceId: "device-a",
    profileGroups: [
      {
        id: "ws",
        name: "Workspace",
        rootPath: null,
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    profiles: Array.from({ length: count }, (_, i) => makeProfile(i)),
    layouts: [],
    preferences: null,
  };
}

describe("validateSyncBundle profile caps", () => {
  it("allows up to MAX_SYNC_PROFILES", () => {
    assert.equal(MAX_SYNC_PROFILES, 60);
    assert.equal(MAX_SYNC_LAYOUTS, 60);
    const result = validateSyncBundle(bundleWithProfiles(44));
    assert.equal(result.ok, true);
  });

  it("rejects more than MAX_SYNC_PROFILES", () => {
    const result = validateSyncBundle(bundleWithProfiles(MAX_SYNC_PROFILES + 1));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "too_many_profiles");
      assert.equal(result.detail?.count, MAX_SYNC_PROFILES + 1);
      assert.equal(result.detail?.maxCount, MAX_SYNC_PROFILES);
    }
  });
});
