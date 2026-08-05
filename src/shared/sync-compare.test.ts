import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planSyncAction } from "./sync-compare.js";
import { SYNC_BUNDLE_VERSION, type SyncBundle } from "./sync-types.js";

function bundle(partial: Partial<SyncBundle> & Pick<SyncBundle, "profiles">): SyncBundle {
  return {
    version: SYNC_BUNDLE_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    deviceId: "device-a",
    profileGroups: [],
    layouts: [],
    preferences: null,
    ...partial,
  };
}

describe("planSyncAction prefer", () => {
  const older = bundle({
    profiles: [
      {
        id: "p1",
        workspaceId: "ws",
        name: "Local",
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  const newer = bundle({
    deviceId: "device-b",
    profiles: [
      {
        id: "p1",
        workspaceId: "ws",
        name: "Cloud",
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  });

  it("defaults to merge (remote ahead → apply)", () => {
    const plan = planSyncAction(older, newer);
    assert.equal(plan.action, "apply_only");
    assert.equal(plan.compareState, "remote_ahead");
    assert.equal(plan.merged.profiles[0]?.name, "Cloud");
  });

  it("prefer local pushes local even when remote is newer", () => {
    const plan = planSyncAction(older, newer, "local");
    assert.equal(plan.action, "push_only");
    assert.equal(plan.compareState, "remote_ahead");
    assert.equal(plan.merged.profiles[0]?.name, "Local");
  });

  it("prefer cloud applies remote even when local is ahead", () => {
    const plan = planSyncAction(newer, older, "cloud");
    assert.equal(plan.action, "apply_only");
    assert.equal(plan.compareState, "local_ahead");
    assert.equal(plan.merged.profiles[0]?.name, "Local");
  });

  it("noop when equal regardless of prefer", () => {
    const plan = planSyncAction(older, older, "local");
    assert.equal(plan.action, "noop");
    assert.equal(plan.compareState, "in_sync");
  });

  it("prefer local uses local bundle as winner (overwrite cloud)", () => {
    const localOnly = bundle({
      profiles: [
        ...older.profiles,
        {
          id: "p-local",
          workspaceId: "ws",
          name: "Only local",
          sortOrder: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    });
    const plan = planSyncAction(localOnly, newer, "local");
    assert.equal(plan.action, "push_only");
    assert.equal(plan.merged.profiles.length, 2);
    assert.ok(plan.merged.profiles.some((p) => p.id === "p-local"));
  });

  it("prefer cloud uses remote bundle as winner (overwrite local)", () => {
    const localOnly = bundle({
      profiles: [
        ...older.profiles,
        {
          id: "p-local",
          workspaceId: "ws",
          name: "Only local",
          sortOrder: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    });
    const plan = planSyncAction(localOnly, newer, "cloud");
    assert.equal(plan.action, "apply_only");
    assert.equal(plan.merged.profiles.length, 1);
    assert.equal(plan.merged.profiles[0]?.name, "Cloud");
    assert.ok(!plan.merged.profiles.some((p) => p.id === "p-local"));
  });
});
