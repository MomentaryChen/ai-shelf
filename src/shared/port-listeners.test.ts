import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachProcessNames,
  dedupeAndSortListeners,
  filterListeners,
  isProtectedPid,
  netstatToListeners,
  parseLsofFields,
  parseNetstatAno,
  parsePortQuery,
  parseSsListen,
  parseTasklistCsv,
  splitHostPort,
} from "./port-listeners.js";

const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1232
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
  TCP    [::]:3000              [::]:0                 LISTENING       12345
  TCP    127.0.0.1:54321        127.0.0.1:3000         ESTABLISHED     999
  UDP    0.0.0.0:5353           *:*                                    2345
  UDP    [::]:5353              *:*                                    2345
`;

const TASKLIST = `
"node.exe","12345","Console","1","45,123 K"
"svchost.exe","2345","Services","0","12,000 K"
"services.exe","1232","Services","0","8,192 K"
`;

const LSOF = `
p12345
cnode
f23u
PTCP
n*:3000
TST=LISTEN
f24u
PTCP
n[::1]:3000
TST=LISTEN
p67890
cChrome
f12u
PTCP
n127.0.0.1:9229
TST=LISTEN
p2345
csvchost
f4u
PUDP
n*:5353
`;

const SS = `
LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=12345,fd=23))
LISTEN 0 511 *:5173 *:* users:(("node",pid=111,fd=18),("node",pid=111,fd=19))
UNCONN 0 0 0.0.0.0:5353 0.0.0.0:* users:(("svchost",pid=2345,fd=4))
LISTEN 0 128 *:22 *:*
`;

describe("parsePortQuery", () => {
  it("treats empty as all listeners", () => {
    assert.deepEqual(parsePortQuery("  "), { ok: true, port: null });
  });

  it("accepts a bare port and host:port", () => {
    assert.deepEqual(parsePortQuery("3000"), { ok: true, port: 3000 });
    assert.deepEqual(parsePortQuery(":5173"), { ok: true, port: 5173 });
    assert.deepEqual(parsePortQuery("127.0.0.1:8080"), { ok: true, port: 8080 });
  });

  it("rejects out-of-range and junk", () => {
    assert.deepEqual(parsePortQuery("0"), { ok: false, reason: "invalid" });
    assert.deepEqual(parsePortQuery("70000"), { ok: false, reason: "invalid" });
    assert.deepEqual(parsePortQuery("abc"), { ok: false, reason: "invalid" });
  });
});

describe("splitHostPort", () => {
  it("parses ipv4, wildcard, and bracketed ipv6", () => {
    assert.deepEqual(splitHostPort("127.0.0.1:3000"), { address: "127.0.0.1", port: 3000 });
    assert.deepEqual(splitHostPort("*:3000"), { address: "*", port: 3000 });
    assert.deepEqual(splitHostPort("[::]:3000"), { address: "::", port: 3000 });
    assert.deepEqual(splitHostPort("[::1]:9229"), { address: "::1", port: 9229 });
  });
});

describe("parseNetstatAno", () => {
  it("keeps listen/udp rows and ignores established clients", () => {
    const parsed = parseNetstatAno(NETSTAT);
    const listeners = netstatToListeners(parsed);
    assert.equal(
      listeners.some((row) => row.pid === 999),
      false,
    );
    const on3000 = listeners.filter((row) => row.port === 3000);
    assert.equal(on3000.length, 2);
    assert.equal(on3000[0]?.pid, 12345);
    assert.equal(
      listeners.some((row) => row.port === 5353 && row.protocol === "udp"),
      true,
    );
  });
});

describe("parseTasklistCsv / attachProcessNames", () => {
  it("maps pid to image name", () => {
    const names = parseTasklistCsv(TASKLIST);
    assert.equal(names.get(12345), "node.exe");
    const rows = attachProcessNames(
      [{ protocol: "tcp", port: 3000, address: "0.0.0.0", pid: 12345 }],
      names,
    );
    assert.equal(rows[0]?.processName, "node.exe");
  });
});

describe("parseLsofFields", () => {
  it("reads pid, command, protocol, and listen sockets", () => {
    const rows = parseLsofFields(LSOF);
    const node = rows.filter((row) => row.pid === 12345);
    assert.equal(node.length, 2);
    assert.equal(node[0]?.processName, "node");
    assert.equal(node[0]?.port, 3000);
    assert.equal(
      rows.some((row) => row.port === 9229 && row.processName === "Chrome"),
      true,
    );
    assert.equal(
      rows.some((row) => row.port === 5353 && row.protocol === "udp"),
      true,
    );
  });
});

describe("parseSsListen", () => {
  it("reads listen and unconn rows with users", () => {
    const rows = parseSsListen(SS);
    assert.equal(
      rows.some((row) => row.port === 3000 && row.processName === "node" && row.pid === 12345),
      true,
    );
    assert.equal(
      rows.some((row) => row.port === 5173 && row.pid === 111),
      true,
    );
    assert.equal(
      rows.some((row) => row.port === 5353 && row.protocol === "udp"),
      true,
    );
    assert.equal(
      rows.some((row) => row.port === 22),
      false,
    );
  });
});

describe("filterListeners / dedupeAndSortListeners", () => {
  it("shows tcp only when no port is set", () => {
    const rows = attachProcessNames(netstatToListeners(parseNetstatAno(NETSTAT)), parseTasklistCsv(TASKLIST));
    const all = filterListeners(rows, null);
    assert.equal(
      all.every((row) => row.protocol === "tcp"),
      true,
    );
    const port3000 = filterListeners(rows, 3000);
    assert.equal(port3000.length, 2);
    assert.equal(dedupeAndSortListeners([...port3000, ...port3000]).length, 2);
  });
});

describe("isProtectedPid", () => {
  it("blocks self, parent, and Windows system pids", () => {
    const opts = { selfPid: 100, parentPid: 50, platform: "win32" };
    assert.equal(isProtectedPid(100, opts), true);
    assert.equal(isProtectedPid(50, opts), true);
    assert.equal(isProtectedPid(4, opts), true);
    assert.equal(isProtectedPid(1, opts), true);
    assert.equal(isProtectedPid(12345, opts), false);
    assert.equal(isProtectedPid(4, { ...opts, platform: "linux" }), false);
    assert.equal(isProtectedPid(1, { ...opts, platform: "linux" }), true);
  });
});
