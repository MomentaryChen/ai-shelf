import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProfileForest, ProfileGroupNode, ProfileInfo } from "../types";
import {
  forestWithoutDefaultProfilesMirror,
  legacyMirrorProfileIds,
  preferredVisibleGroupId,
} from "./default-profiles-workspace.js";

function profile(id: string, name: string, workspaceId: string): ProfileInfo {
  return {
    id,
    workspaceId,
    name,
    defaultCwd: "/tmp",
    defaultTool: "claude",
    broadcastInput: false,
    accentColor: null,
    remote: null,
    paneCount: 0,
    terminals: [],
    savedCommands: [],
    updatedAt: null,
  };
}

function group(id: string, name: string, profiles: ProfileInfo[]): ProfileGroupNode {
  return {
    id,
    name,
    profileCount: profiles.length,
    updatedAt: null,
    profiles,
  };
}

function forest(
  groups: ProfileGroupNode[],
  lastActiveGroupId: string | null,
  lastActiveProfileId: string | null,
): ProfileForest {
  return {
    groups,
    lastActiveGroupId,
    lastActiveProfileId,
    lastActiveByGroup: {},
  };
}

describe("forestWithoutDefaultProfilesMirror", () => {
  it("keeps the Profiles workspace when it is the only one", () => {
    const profiles = group("profiles", "Profiles", [
      profile("p1", "Optim Event Proto", "profiles"),
      profile("p2", "Personal", "profiles"),
    ]);
    const input = forest([profiles], "profiles", "p1");
    assert.equal(forestWithoutDefaultProfilesMirror(input), input);
  });

  it("drops the Profiles workspace when it only mirrors other workspaces", () => {
    const work = group("work", "Work", [
      profile("real-proto", "Optim Event Proto", "work"),
      profile("real-api", "Open API", "work"),
    ]);
    const personal = group("personal", "Personal", [profile("real-me", "Personal", "personal")]);
    const profiles = group("profiles", "Profiles", [
      profile("mirror-proto", "Work / Optim Event Proto", "profiles"),
      profile("mirror-api", "Work / Open API", "profiles"),
      profile("mirror-me", "Personal / Personal", "profiles"),
    ]);
    const input = forest([work, personal, profiles], "profiles", "mirror-proto");

    const visible = forestWithoutDefaultProfilesMirror(input);

    assert.deepEqual(
      visible.groups.map((g) => g.name),
      ["Work", "Personal"],
    );
    assert.equal(visible.lastActiveGroupId, "work");
    assert.equal(visible.lastActiveProfileId, "real-proto");
    assert.equal(legacyMirrorProfileIds(input.groups).size, 3);
  });

  it("keeps profiles that live only in the Profiles workspace", () => {
    const work = group("work", "Work", [profile("real-proto", "Optim Event Proto", "work")]);
    const profiles = group("profiles", "Profiles", [
      profile("mirror-proto", "Work / Optim Event Proto", "profiles"),
      profile("notes", "Scratch", "profiles"),
    ]);
    const input = forest([work, profiles], "profiles", "notes");

    const visible = forestWithoutDefaultProfilesMirror(input);
    const kept = visible.groups.find((g) => g.name === "Profiles");

    assert.ok(kept);
    assert.deepEqual(
      kept.profiles.map((p) => p.name),
      ["Scratch"],
    );
    assert.equal(kept.profileCount, 1);
    assert.equal(visible.lastActiveGroupId, "profiles");
    assert.equal(visible.lastActiveProfileId, "notes");
  });

  it("leaves a renamed catch-all workspace alone", () => {
    const work = group("work", "Work", [profile("real", "Proto", "work")]);
    const renamed = group("old", "All profiles", [profile("copy", "Work / Proto", "old")]);
    const input = forest([work, renamed], "old", "copy");
    assert.equal(forestWithoutDefaultProfilesMirror(input), input);
  });

  it("hides an empty Profiles workspace once another workspace exists", () => {
    const work = group("work", "Work", [profile("real", "Proto", "work")]);
    const profiles = group("profiles", "Profiles", []);
    const visible = forestWithoutDefaultProfilesMirror(forest([profiles, work], "profiles", null));
    assert.deepEqual(
      visible.groups.map((g) => g.id),
      ["work"],
    );
    assert.equal(visible.lastActiveGroupId, "work");
    assert.equal(visible.lastActiveProfileId, "real");
  });

  it("is idempotent", () => {
    const work = group("work", "Work", [profile("real", "Proto", "work")]);
    const profiles = group("profiles", "Profiles", [profile("mirror", "Work / Proto", "profiles")]);
    const once = forestWithoutDefaultProfilesMirror(forest([work, profiles], "work", "real"));
    const twice = forestWithoutDefaultProfilesMirror(once);
    assert.equal(twice, once);
  });
});

describe("preferredVisibleGroupId", () => {
  it("skips a group id that is no longer in the forest", () => {
    const work = group("work", "Work", [profile("real", "Proto", "work")]);
    const visible = forest([work], "work", "real");
    assert.equal(preferredVisibleGroupId(visible, ["profiles", "work"]), "work");
    assert.equal(preferredVisibleGroupId(visible, ["missing"]), "work");
    assert.equal(preferredVisibleGroupId(null, ["work"]), null);
  });
});
