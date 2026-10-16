import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachProcessNames,
  dedupeAndSortListeners,
  filterListeners,
  isProtectedPid,
  listenerKey,
  netstatToListeners,
  parseLsofFields,
  parseNetstatAno,
  parsePortQuery,
  parseProcNetTcp,
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

// `ss -ltnp` as a non-root WSL user: no Netid column, header row, other users' sockets lack users:().
const SS_WSL = `
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*
LISTEN 0      128          0.0.0.0:22         0.0.0.0:*
LISTEN 0      511                *:5173             *:*     users:(("node",pid=311,fd=21))
LISTEN 0      511            [::1]:8080          [::]:*
LISTEN 0      5    [fe80::1%eth0]:546           [::]:*
`;

const PROC_NET_TCP = `
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 3500007F:0035 00000000:0000 0A 00000000:00000000 00:00000000 00000000   101        0 1 1
   1: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2 1
   2: 0100007F:0BB8 0100007F:D431 01 00000000:00000000 00:00000000 00000000  1000        0 3 1
  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000000000000:0016 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 4 1
   1: 00000000000000000000000001000000:1F90 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 5 1
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

  it("reads the Netid column printed by `ss -lptunH`", () => {
    const rows = parseSsListen(
      [
        'tcp   LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=42,fd=20))',
        'udp   UNCONN 0 0   0.0.0.0:5353 0.0.0.0:* users:(("avahi",pid=7,fd=12))',
      ].join("\n"),
    );
    assert.deepEqual(
      rows.map((r) => [r.protocol, r.port, r.pid, r.processName]),
      [
        ["tcp", 3000, 42, "node"],
        ["udp", 5353, 7, "avahi"],
      ],
    );
  });

  it("keeps pid-less WSL rows, strips scope ids and skips the header", () => {
    const rows = parseSsListen(SS_WSL, { allowMissingPid: true });
    assert.deepEqual(
      rows.map((r) => [r.address, r.port, r.pid, r.processName]),
      [
        ["127.0.0.53", 53, 0, ""],
        ["0.0.0.0", 22, 0, ""],
        ["*", 5173, 311, "node"],
        ["::1", 8080, 0, ""],
        ["fe80::1", 546, 0, ""],
      ],
    );
  });
});

describe("parseProcNetTcp", () => {
  it("reads LISTEN rows from /proc/net/tcp and tcp6", () => {
    const rows = parseProcNetTcp(PROC_NET_TCP);
    assert.deepEqual(
      rows.map((r) => [r.address, r.port, r.pid]),
      [
        ["127.0.0.53", 53, 0],
        ["0.0.0.0", 3000, 0],
        ["::", 22, 0],
        ["::1", 8080, 0],
      ],
    );
  });
});

describe("listenerKey", () => {
  it("separates host and WSL rows with the same socket", () => {
    const host = { protocol: "tcp" as const, address: "0.0.0.0", port: 3000, pid: 0 };
    assert.notEqual(listenerKey(host), listenerKey({ ...host, wslDistro: "Ubuntu" }));
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
