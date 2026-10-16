import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUnixPtyCandidates,
  effectiveUnixShellPref,
  effectiveWindowsShellPref,
  orderWindowsPtyCandidates,
  buildWindowsPtyCandidates,
  buildWslPtyArgs,
  isValidWslDistroName,
  resolvePtySpawnPlan,
  unixShellArgs,
} from "./pty-shell.js";

describe("buildUnixPtyCandidates", () => {
  it("puts $SHELL first for auto", () => {
    const list = buildUnixPtyCandidates("", "auto", "/bin/zsh");
    assert.equal(list[0]?.[0], "/bin/zsh");
    assert.ok(list.some(([file]) => file === "bash"));
    assert.ok(list.some(([file]) => file === "fish"));
  });

  it("prefers zsh family when requested even if $SHELL is bash", () => {
    const list = buildUnixPtyCandidates("", "zsh", "/bin/bash");
    assert.notEqual(list[0]?.[0], "/bin/bash");
    assert.ok(list[0]?.[0] === "zsh" || list[0]?.[0]?.includes("zsh"));
    assert.ok(list.some(([file]) => file === "/bin/bash"));
  });

  it("re-execs the chosen shell after a tool command", () => {
    const list = buildUnixPtyCandidates("claude", "auto", "/bin/zsh");
    assert.deepEqual(list[0]?.[1], ["-c", "claude; exec '/bin/zsh'"]);
  });
});

describe("unixShellArgs", () => {
  it("returns empty args for interactive shells", () => {
    assert.deepEqual(unixShellArgs("/bin/zsh", ""), []);
  });

  it("injects bash init-file for OSC 7 when provided", () => {
    assert.deepEqual(unixShellArgs("/bin/bash", "", "/tmp/osc7.sh"), [
      "--init-file",
      "/tmp/osc7.sh",
    ]);
    assert.deepEqual(unixShellArgs("/bin/zsh", "", "/tmp/osc7.sh"), []);
  });
});

describe("effective prefs", () => {
  it("maps Windows ids to auto on Unix", () => {
    assert.equal(effectiveUnixShellPref("pwsh"), "auto");
    assert.equal(effectiveUnixShellPref("zsh"), "zsh");
  });

  it("maps Unix ids to auto on Windows", () => {
    assert.equal(effectiveWindowsShellPref("zsh"), "auto");
    assert.equal(effectiveWindowsShellPref("powershell"), "powershell");
  });
});

describe("windows ordering", () => {
  it("orders pwsh first by default", () => {
    const list = orderWindowsPtyCandidates(buildWindowsPtyCandidates(""), "auto");
    assert.deepEqual(
      list.map(([sh]) => sh),
      ["pwsh.exe", "powershell.exe", "cmd.exe"],
    );
  });

  it("puts cmd first only for interactive shells", () => {
    const interactive = orderWindowsPtyCandidates(buildWindowsPtyCandidates(""), "cmd");
    assert.deepEqual(
      interactive.map(([sh]) => sh),
      ["cmd.exe", "powershell.exe", "pwsh.exe"],
    );
  });

  it("keeps pwsh first when launching an AI CLI even if cmd is preferred", () => {
    const list = orderWindowsPtyCandidates(
      buildWindowsPtyCandidates("claude"),
      "cmd",
      "claude",
    );
    assert.equal(list[0]?.[0], "pwsh.exe");
    assert.equal(list.at(-1)?.[0], "cmd.exe");
  });
});

describe("windows cmd tool args", () => {
  it("passes AI CLI commands without pre-quotes so node-pty can join them", () => {
    const list = buildWindowsPtyCandidates("claude");
    const cmd = list.find(([sh]) => sh === "cmd.exe");
    assert.deepEqual(cmd?.[1], ["/d", "/s", "/k", "claude"]);
  });

  it("keeps extra args as one argv for cmd /k", () => {
    const list = buildWindowsPtyCandidates("claude --model sonnet");
    const cmd = list.find(([sh]) => sh === "cmd.exe");
    assert.deepEqual(cmd?.[1], ["/d", "/s", "/k", "claude --model sonnet"]);
  });

  it("keeps interactive cmd as /k", () => {
    const list = buildWindowsPtyCandidates("");
    const cmd = list.find(([sh]) => sh === "cmd.exe");
    assert.deepEqual(cmd?.[1], ["/k"]);
  });
});

describe("resolvePtySpawnPlan", () => {
  it("returns unix candidate cascade on non-Windows", () => {
    const plan = resolvePtySpawnPlan({
      command: "",
      shell: "auto",
      platform: "linux",
      env: { SHELL: "/usr/bin/fish", PATH: "/usr/bin" },
    });
    assert.equal(plan.platform, "unix");
    assert.equal(plan.unixCandidates[0]?.[0], "/usr/bin/fish");
    assert.equal(plan.unix.file, "/usr/bin/fish");
  });

  it("launches Claude via pwsh-first even when the preferred shell is cmd", () => {
    const plan = resolvePtySpawnPlan({
      command: "claude",
      shell: "cmd",
      platform: "win32",
    });
    assert.equal(plan.platform, "win32");
    assert.equal(plan.windowsCandidates[0]?.[0], "pwsh.exe");
    assert.equal(plan.windowsCandidates.at(-1)?.[0], "cmd.exe");
  });

  it("puts wsl.exe first with distro + cwd and keeps the Windows cascade as fallback", () => {
    const plan = resolvePtySpawnPlan({
      command: "",
      shell: "wsl",
      platform: "win32",
      wsl: { distro: "Ubuntu-22.04", cwd: "C:\\work\\repo" },
    });
    assert.deepEqual(plan.windowsCandidates[0], [
      "wsl.exe",
      ["-d", "Ubuntu-22.04", "--cd", "C:\\work\\repo"],
    ]);
    assert.deepEqual(
      plan.windowsCandidates.slice(1).map(([sh]) => sh),
      ["pwsh.exe", "powershell.exe", "cmd.exe"],
    );
  });

  it("ignores wsl on non-Windows hosts", () => {
    const plan = resolvePtySpawnPlan({
      command: "",
      shell: "wsl",
      platform: "linux",
      env: { SHELL: "/bin/bash" },
    });
    assert.equal(plan.platform, "unix");
    assert.equal(plan.unixCandidates[0]?.[0], "/bin/bash");
  });
});

describe("buildWslPtyArgs", () => {
  it("uses the default distro when none (or an invalid name) is given", () => {
    assert.deepEqual(buildWslPtyArgs({}), []);
    assert.deepEqual(buildWslPtyArgs({ distro: "  " }), []);
    assert.deepEqual(buildWslPtyArgs({ distro: "bad name; rm -rf /" }), []);
  });

  it("runs a tool in a login bash and stays in a shell afterwards", () => {
    assert.deepEqual(buildWslPtyArgs({ distro: "Debian", command: "claude --model opus" }), [
      "-d",
      "Debian",
      "--exec",
      "bash",
      "-lic",
      "claude --model opus; exec ${SHELL:-bash} -l",
    ]);
  });

  it("validates distro names", () => {
    assert.equal(isValidWslDistroName("Ubuntu"), true);
    assert.equal(isValidWslDistroName("docker-desktop"), true);
    assert.equal(isValidWslDistroName("openSUSE-Leap-15.6"), true);
    assert.equal(isValidWslDistroName("-d"), false);
    assert.equal(isValidWslDistroName("a b"), false);
  });
});
