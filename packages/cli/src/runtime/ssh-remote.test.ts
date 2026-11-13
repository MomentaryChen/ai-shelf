import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRemoteSshCommand,
  buildSshArgs,
  normalizeRemoteSshConfig,
  resolveSshExecutable,
  sshExecutableCandidates,
} from "./ssh-remote.js";
import { resolvePtySpawnPlan } from "./pty-shell.js";

describe("normalizeRemoteSshConfig", () => {
  it("accepts a full config and trims fields", () => {
    assert.deepEqual(
      normalizeRemoteSshConfig({
        kind: "ssh",
        host: " box.internal ",
        user: "dev",
        port: "2222",
        jump: "ops@gw.example.com:22, gw2",
        cwd: " ~/work/app ",
      }),
      {
        kind: "ssh",
        host: "box.internal",
        user: "dev",
        port: 2222,
        jump: "ops@gw.example.com:22,gw2",
        cwd: "~/work/app",
      },
    );
  });

  it("accepts a bare ~/.ssh/config alias", () => {
    assert.deepEqual(normalizeRemoteSshConfig({ kind: "ssh", host: "my-box" }), {
      kind: "ssh",
      host: "my-box",
    });
  });

  it("rejects option injection and shell metacharacters", () => {
    for (const host of ["-oProxyCommand=calc", "box;rm -rf /", "a b", "", "user@box", "$(id)"]) {
      assert.equal(normalizeRemoteSshConfig({ kind: "ssh", host }), null, host);
    }
    assert.equal(normalizeRemoteSshConfig({ kind: "ssh", host: "box", user: "-l" }), null);
    assert.equal(normalizeRemoteSshConfig({ kind: "ssh", host: "box", jump: "-oX=y" }), null);
    assert.equal(normalizeRemoteSshConfig({ kind: "ssh", host: "box", jump: "gw:99999" }), null);
    assert.equal(normalizeRemoteSshConfig({ kind: "ssh", host: "box", port: 0 }), null);
    assert.equal(normalizeRemoteSshConfig({ kind: "ssh", host: "box", cwd: "a\nb" }), null);
  });

  it("rejects unknown kinds and non-objects", () => {
    assert.equal(normalizeRemoteSshConfig(null), null);
    assert.equal(normalizeRemoteSshConfig("box"), null);
    assert.equal(normalizeRemoteSshConfig({ host: "box" }), null);
    assert.equal(normalizeRemoteSshConfig({ kind: "telnet", host: "box" }), null);
  });

  it("drops unknown fields such as free-form ssh options", () => {
    const out = normalizeRemoteSshConfig({ kind: "ssh", host: "box", options: "ProxyCommand=x" });
    assert.deepEqual(out, { kind: "ssh", host: "box" });
  });
});

describe("buildRemoteSshCommand", () => {
  it("is empty for a plain login shell", () => {
    assert.equal(buildRemoteSshCommand({}), "");
  });

  it("wraps cd + tool in bash -lic and hands over to the login shell", () => {
    assert.equal(
      buildRemoteSshCommand({ cwd: "/srv/app", command: "claude" }),
      `exec bash -lic 'cd '\\''/srv/app'\\''; claude; exec "\${SHELL:-bash}" -l'`,
    );
  });

  it("keeps ~ expansion and quotes the rest", () => {
    assert.match(buildRemoteSshCommand({ cwd: "~/my dir" }), /cd ~\/'\\''my dir'\\''/);
    assert.match(buildRemoteSshCommand({ cwd: "~" }), /'cd ~; exec/);
  });

  it("neutralizes quotes in the remote dir", () => {
    const cmd = buildRemoteSshCommand({ cwd: "/tmp/it's; rm -rf ~" });
    // Inner script must be a single cd argument: the quote is escaped, not closed.
    assert.ok(cmd.includes(`it'\\''\\'\\'''\\''s; rm -rf ~`));
  });
});

describe("buildSshArgs", () => {
  it("puts options before -- and the host last", () => {
    const args = buildSshArgs(
      { kind: "ssh", host: "box", user: "dev", port: 2222, jump: "gw" },
      "codex",
    );
    assert.deepEqual(args.slice(0, 5), [
      "-t",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
    ]);
    assert.deepEqual(args.slice(5, 11), ["-p", "2222", "-l", "dev", "-J", "gw"]);
    assert.equal(args[11], "--");
    assert.equal(args[12], "box");
    assert.match(args[13] ?? "", /codex/);
    assert.equal(args.length, 14);
  });

  it("omits the remote command for a plain shell", () => {
    assert.deepEqual(buildSshArgs({ kind: "ssh", host: "box" }).slice(-2), ["--", "box"]);
  });

  it("throws on an invalid config instead of degrading", () => {
    assert.throws(() => buildSshArgs({ kind: "ssh", host: "-oProxyCommand=x" }));
  });
});

describe("resolvePtySpawnPlan with ssh", () => {
  it("returns only the ssh candidate (no local fallback)", () => {
    const plan = resolvePtySpawnPlan({
      command: "claude",
      shell: "pwsh",
      platform: "win32",
      ssh: {
        executable: "C:\\Windows\\System32\\OpenSSH\\ssh.exe",
        config: { kind: "ssh", host: "box" },
      },
    });
    assert.equal(plan.windowsCandidates.length, 1);
    assert.equal(plan.windowsCandidates[0]?.[0], "C:\\Windows\\System32\\OpenSSH\\ssh.exe");
    assert.equal(plan.unixCandidates.length, 0);

    const unix = resolvePtySpawnPlan({
      command: "",
      platform: "linux",
      ssh: { executable: "/usr/bin/ssh", config: { kind: "ssh", host: "box" } },
    });
    assert.deepEqual(
      unix.unixCandidates.map(([f]) => f),
      ["/usr/bin/ssh"],
    );
  });
});

describe("ssh executable discovery", () => {
  it("prefers System32 OpenSSH on Windows, then PATH, then Git for Windows", () => {
    const list = sshExecutableCandidates("win32", {
      SystemRoot: "C:\\Windows",
      PATH: "C:\\tools;C:\\Windows\\System32\\OpenSSH",
      ProgramFiles: "C:\\Program Files",
    });
    assert.equal(list[0], "C:\\Windows\\System32\\OpenSSH\\ssh.exe");
    assert.equal(list[1], "C:\\tools\\ssh.exe");
    assert.ok(list.includes("C:\\Program Files\\Git\\usr\\bin\\ssh.exe"));
    assert.equal(new Set(list).size, list.length);
  });

  it("returns null when nothing exists", () => {
    assert.equal(
      resolveSshExecutable("win32", { SystemRoot: "C:\\Windows" }, () => false),
      null,
    );
  });

  it("returns the first existing candidate", () => {
    const found = resolveSshExecutable(
      "win32",
      { SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" },
      (p) => p.includes("Git"),
    );
    assert.equal(found, "C:\\Program Files\\Git\\usr\\bin\\ssh.exe");
  });
});
