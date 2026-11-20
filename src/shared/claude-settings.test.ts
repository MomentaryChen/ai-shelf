import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyClaudeSettingsDraft,
  draftFromSettings,
  emptyDraft,
  findPermissionConflicts,
  parseClaudeSettingsText,
  renderClaudeSettingsEdit,
  sanitizeClaudeSettingsDraft,
  serializeClaudeSettings,
  validateHookCommand,
  validateHookEvent,
  validateHookMatcher,
  validatePermissionRule,
} from "./claude-settings.js";

const SAMPLE = {
  model: "opus",
  permissions: {
    allow: ["Bash(npm run test:*)", "Read(~/.zshrc)"],
    deny: ["Read(./.env)"],
    disableBypassPermissionsMode: "disable",
  },
  env: { FOO: "1" },
  hooks: {
    PostToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [{ type: "command", command: "npx prettier --write", timeout: 30, extraFlag: true }],
      },
    ],
    Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
  },
  statusLine: { type: "command", command: "x" },
};

describe("parseClaudeSettingsText", () => {
  it("treats empty text as an empty object", () => {
    const r = parseClaudeSettingsText("  \n");
    assert.ok(r.ok);
    assert.deepEqual(r.data, {});
    assert.deepEqual(r.draft, emptyDraft());
  });

  it("rejects invalid JSON, comments and non-objects", () => {
    assert.equal(parseClaudeSettingsText("{").ok, false);
    assert.equal(parseClaudeSettingsText('{ // c\n "a": 1 }').ok, false);
    assert.equal(parseClaudeSettingsText("[1]").ok, false);
  });

  it("builds a draft from permissions and hooks", () => {
    const r = parseClaudeSettingsText(JSON.stringify(SAMPLE));
    assert.ok(r.ok);
    assert.deepEqual(r.draft.permissions.allow, ["Bash(npm run test:*)", "Read(~/.zshrc)"]);
    assert.deepEqual(r.draft.permissions.ask, []);
    assert.equal(r.draft.hooks.length, 2);
    assert.equal(r.draft.hooks[0]!.event, "PostToolUse");
    assert.equal(r.draft.hooks[0]!.groups[0]!.matcher, "Edit|Write");
    assert.equal(r.draft.hooks[0]!.groups[0]!.commands[0]!.timeout, 30);
    assert.equal(r.draft.hooks[1]!.groups[0]!.matcher, "");
  });
});

describe("applyClaudeSettingsDraft", () => {
  it("round-trips unchanged settings byte-for-byte (2-space JSON)", () => {
    const text = `${JSON.stringify(SAMPLE, null, 2)}\n`;
    const r = parseClaudeSettingsText(text);
    assert.ok(r.ok);
    assert.equal(renderClaudeSettingsEdit(text, r.draft), text);
  });

  it("preserves other keys, key order and unknown nested fields", () => {
    const draft = draftFromSettings(SAMPLE);
    draft.permissions.ask.push("Bash(git push:*)");
    draft.hooks[0]!.groups[0]!.commands[0]!.command = "pnpm format";
    const out = applyClaudeSettingsDraft(SAMPLE, draft);
    assert.deepEqual(Object.keys(out), Object.keys(SAMPLE));
    assert.deepEqual(out["env"], SAMPLE.env);
    const perms = out["permissions"] as Record<string, unknown>;
    assert.equal(perms["disableBypassPermissionsMode"], "disable");
    assert.deepEqual(perms["ask"], ["Bash(git push:*)"]);
    const hooks = out["hooks"] as Record<string, Array<{ hooks: Record<string, unknown>[] }>>;
    assert.deepEqual(hooks["PostToolUse"]![0]!.hooks[0], {
      type: "command",
      command: "pnpm format",
      timeout: 30,
      extraFlag: true,
    });
  });

  it("drops empty sections and adds new ones at the end", () => {
    const draft = draftFromSettings(SAMPLE);
    draft.hooks = [];
    draft.permissions.allow = [];
    draft.permissions.deny = [" ", ""];
    const out = applyClaudeSettingsDraft(SAMPLE, draft);
    assert.equal("hooks" in out, false);
    // unknown key keeps the permissions object alive
    assert.deepEqual(out["permissions"], { disableBypassPermissionsMode: "disable" });

    const fresh = emptyDraft();
    fresh.permissions.allow.push("WebFetch(domain:example.com)");
    fresh.permissions.defaultMode = "acceptEdits";
    fresh.hooks.push({
      event: "PreToolUse",
      groups: [{ matcher: "Bash", commands: [{ command: "./check.sh", extra: {} }], extra: {} }],
    });
    const added = applyClaudeSettingsDraft({ model: "x" }, fresh);
    assert.deepEqual(Object.keys(added), ["model", "permissions", "hooks"]);
    assert.deepEqual(added["hooks"], {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./check.sh" }] }],
    });
  });

  it("drops commands with empty text and groups without commands", () => {
    const d = emptyDraft();
    d.hooks.push({
      event: "Stop",
      groups: [{ matcher: "", commands: [{ command: "  ", extra: {} }], extra: {} }],
    });
    assert.equal("hooks" in applyClaudeSettingsDraft({}, d), false);
  });

  it("removes timeout when cleared", () => {
    const draft = draftFromSettings(SAMPLE);
    draft.hooks[0]!.groups[0]!.commands[0]!.timeout = undefined;
    const out = applyClaudeSettingsDraft(SAMPLE, draft);
    const cmd = (out["hooks"] as Record<string, Array<{ hooks: Record<string, unknown>[] }>>)[
      "PostToolUse"
    ]![0]!.hooks[0]!;
    assert.equal("timeout" in cmd, false);
  });

  it("creates a new file as {} plus edits", () => {
    assert.equal(renderClaudeSettingsEdit("", emptyDraft()), "{}\n");
  });

  it("throws on invalid JSON so callers fall back to the raw editor", () => {
    assert.throws(() => renderClaudeSettingsEdit("{bad", emptyDraft()));
  });
});

describe("serializeClaudeSettings", () => {
  it("keeps CRLF line endings", () => {
    assert.equal(
      serializeClaudeSettings({ a: 1 }, '{\r\n  "a": 0\r\n}\r\n'),
      '{\r\n  "a": 1\r\n}\r\n',
    );
  });
});

describe("validatePermissionRule", () => {
  it("accepts documented rule shapes", () => {
    for (const rule of [
      "Bash(npm run test:*)",
      "Read(./.env)",
      "WebFetch(domain:example.com)",
      "mcp__github__create_issue",
      "mcp__puppeteer",
      "Edit",
      "Bash(echo (a))",
    ]) {
      assert.equal(validatePermissionRule(rule), null, rule);
    }
  });

  it("warns on suspicious rules", () => {
    assert.equal(validatePermissionRule("  "), "empty");
    assert.equal(validatePermissionRule("Bash(npm"), "unbalancedParens");
    assert.equal(validatePermissionRule("Bash)("), "unbalancedParens");
    assert.equal(validatePermissionRule("bash(ls)"), "unknownTool");
    assert.equal(validatePermissionRule("Bash (ls)"), "badFormat");
    assert.equal(validatePermissionRule("mcp__a b"), "badFormat");
  });
});

describe("findPermissionConflicts", () => {
  it("reports rules present in more than one list", () => {
    const d = emptyDraft().permissions;
    d.allow = ["Bash(ls)", "Read"];
    d.deny = [" Bash(ls) "];
    d.ask = ["Read", "Bash(ls)"];
    assert.deepEqual(findPermissionConflicts(d), [
      { rule: "Bash(ls)", lists: ["allow", "ask", "deny"] },
      { rule: "Read", lists: ["allow", "ask"] },
    ]);
  });

  it("ignores duplicates within one list", () => {
    const d = emptyDraft().permissions;
    d.allow = ["Read", "Read"];
    assert.deepEqual(findPermissionConflicts(d), []);
  });
});

describe("hook validation", () => {
  it("flags events, matchers and commands", () => {
    assert.equal(validateHookEvent("PreToolUse"), null);
    assert.equal(validateHookEvent("OnSave"), "unknownEvent");
    assert.equal(validateHookMatcher("PreToolUse", "Edit|Write"), null);
    assert.equal(validateHookMatcher("PreToolUse", "*"), null);
    assert.equal(validateHookMatcher("PreToolUse", "("), "badMatcher");
    assert.equal(validateHookMatcher("Stop", "Bash"), "matcherIgnored");
    assert.equal(validateHookMatcher("Stop", ""), null);
    assert.equal(validateHookCommand({ command: "", extra: {} }), "emptyCommand");
    assert.equal(validateHookCommand({ command: "x", timeout: 0, extra: {} }), "badTimeout");
    assert.equal(validateHookCommand({ command: "x", timeout: 5, extra: {} }), null);
  });
});

describe("sanitizeClaudeSettingsDraft", () => {
  it("accepts a well-formed draft and drops junk fields", () => {
    const d = draftFromSettings(SAMPLE);
    const s = sanitizeClaudeSettingsDraft(JSON.parse(JSON.stringify({ ...d, junk: 1 })));
    assert.ok(s);
    assert.deepEqual(s, d);
  });

  it("rejects malformed payloads", () => {
    assert.equal(sanitizeClaudeSettingsDraft(null), null);
    assert.equal(sanitizeClaudeSettingsDraft({ permissions: {}, hooks: {} }), null);
    assert.equal(
      sanitizeClaudeSettingsDraft({
        permissions: {},
        hooks: [{ event: "Stop", groups: [{ commands: [{}] }] }],
      }),
      null,
    );
  });
});

describe("data the draft cannot express", () => {
  const RAW = {
    permissions: { allow: ["Read"], deny: [], ask: [42] },
    hooks: {
      PreToolUse: [
        {
          matcher: "",
          hooks: [
            { type: "prompt", prompt: "Is this safe? $ARGUMENTS" },
            { type: "command", command: "./log.sh" },
          ],
        },
      ],
      PermissionRequest: [{ matcher: "Bash", hooks: [{ type: "agent", prompt: "check" }] }],
      Weird: "not-an-array",
    },
  };
  const text = `${JSON.stringify(RAW, null, 2)}\n`;

  it("leaves the hooks section byte-identical on a permissions-only edit", () => {
    const parsed = parseClaudeSettingsText(text);
    assert.ok(parsed.ok);
    parsed.draft.permissions.allow.push("Bash(ls)");
    const out = JSON.parse(renderClaudeSettingsEdit(text, parsed.draft)) as Record<string, unknown>;
    assert.deepEqual(out["hooks"], RAW.hooks);
    assert.deepEqual((out["permissions"] as { allow: string[] }).allow, ["Read", "Bash(ls)"]);
  });

  it("leaves the permissions section untouched on a hooks-only edit", () => {
    const parsed = parseClaudeSettingsText(text);
    assert.ok(parsed.ok);
    parsed.draft.hooks[0]!.groups[0]!.commands[1]!.command = "./log2.sh";
    const out = JSON.parse(renderClaudeSettingsEdit(text, parsed.draft)) as Record<string, unknown>;
    assert.deepEqual(out["permissions"], RAW.permissions);
  });

  it("passes prompt / agent hooks through a hooks edit", () => {
    const parsed = parseClaudeSettingsText(text);
    assert.ok(parsed.ok);
    parsed.draft.hooks[0]!.groups[0]!.commands[1]!.command = "./log2.sh";
    const out = JSON.parse(renderClaudeSettingsEdit(text, parsed.draft)) as {
      hooks: Record<string, Array<{ hooks: unknown[] }>>;
    };
    assert.deepEqual(out.hooks["PreToolUse"]![0]!.hooks, [
      { type: "prompt", prompt: "Is this safe? $ARGUMENTS" },
      { type: "command", command: "./log2.sh" },
    ]);
    assert.deepEqual(out.hooks["PermissionRequest"], RAW.hooks.PermissionRequest);
    assert.equal(validateHookCommand(parsed.draft.hooks[0]!.groups[0]!.commands[0]!), null);
  });
});
