import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySshFailure, isSshPaneShell } from "./ssh-failure.js";

describe("classifySshFailure", () => {
  const cases: [string, string][] = [
    ["Host key verification failed.\r\n", "hostkey"],
    ["Warning: Identity file C:/k not accessible: No such file or directory.\r\nno such identity: C:/k\r\ndev@box: Permission denied (publickey).", "keyfile"],
    ["dev@box: Permission denied (publickey,password).\r\n", "auth"],
    ["ssh: Could not resolve hostname nope: No such host is known.\r\n", "resolve"],
    ["ssh: connect to host 10.0.0.9 port 22: Connection timed out\r\n", "timeout"],
    ["ssh: connect to host box port 22: Connection refused\r\n", "refused"],
    ["Connection closed by UNKNOWN port 65535\r\n", "jump"],
    // Real Windows OpenSSH output when the gateway itself refuses: jump wins over refused.
    ["ssh: connect to host 127.0.0.1 port 1: Connection refused\r\nConnection closed by UNKNOWN port 65535\r\n", "jump"],
    ["something else\r\n", "unknown"],
  ];
  for (const [output, kind] of cases) {
    it(`${kind}`, () => assert.equal(classifySshFailure(output), kind));
  }
});

describe("isSshPaneShell", () => {
  it("matches remote pane meta only", () => {
    assert.equal(isSshPaneShell("ssh:dev@box"), true);
    assert.equal(isSshPaneShell("pwsh"), false);
    assert.equal(isSshPaneShell(null), false);
  });
});
