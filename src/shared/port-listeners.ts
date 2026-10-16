/** Parse OS port-listener listings. Used by the Ports tool (main process + tests). */

export type PortProtocol = "tcp" | "udp";

export type PortListener = {
  protocol: PortProtocol;
  port: number;
  address: string;
  pid: number;
  processName: string;
  /** Set for sockets listed inside a WSL distro (pid is in the Linux namespace, 0 when unknown). */
  wslDistro?: string;
};

export type PortListenerRow = PortListener & { canKill: boolean };

/** Per-distro outcome of a WSL port scan (only running distros are scanned). */
export type WslPortScan = {
  distro: string;
  ok: boolean;
  count: number;
  error?: string;
};

export type ParsedSocket = {
  protocol: PortProtocol;
  address: string;
  port: number;
  pid: number;
  state: string | null;
};

export type PortQuery = { ok: true; port: number | null } | { ok: false; reason: "invalid" };

export const COMMON_DEV_PORTS = [3000, 5173, 8080, 4173, 9229, 5432] as const;

const WINDOWS_SYSTEM_PIDS = new Set([0, 4]);

export function isPortNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function parsePortQuery(input: string): PortQuery {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, port: null };
  if (/^\d+$/u.test(trimmed)) {
    const port = Number(trimmed);
    return isPortNumber(port) ? { ok: true, port } : { ok: false, reason: "invalid" };
  }
  const loc = splitHostPort(trimmed.startsWith(":") ? `*${trimmed}` : trimmed);
  return loc ? { ok: true, port: loc.port } : { ok: false, reason: "invalid" };
}

export function splitHostPort(addr: string): { address: string; port: number } | null {
  const trimmed = addr.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const m = trimmed.match(/^\[([^\]]+)\]:(\d+)$/u);
    if (!m) return null;
    const port = Number(m[2]);
    if (!isPortNumber(port)) return null;
    return { address: m[1] || "*", port };
  }
  const i = trimmed.lastIndexOf(":");
  if (i <= 0 || i === trimmed.length - 1) return null;
  const port = Number(trimmed.slice(i + 1));
  if (!isPortNumber(port)) return null;
  return { address: trimmed.slice(0, i) || "*", port };
}

export function isListenState(state: string | null): boolean {
  if (!state) return false;
  const s = state.toUpperCase();
  return s === "LISTENING" || s === "LISTEN";
}

export function isProtectedPid(
  pid: number,
  opts: { selfPid: number; parentPid: number; platform: string },
): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return true;
  if (pid === opts.selfPid || pid === opts.parentPid) return true;
  if (opts.platform === "win32" && WINDOWS_SYSTEM_PIDS.has(pid)) return true;
  return false;
}

export function listenerKey(
  row: Pick<PortListener, "protocol" | "address" | "port" | "pid" | "wslDistro">,
): string {
  const host = row.wslDistro ? `wsl:${row.wslDistro}` : "host";
  return `${host}|${row.protocol}|${row.address}|${String(row.port)}|${String(row.pid)}`;
}

export function dedupeAndSortListeners(rows: PortListener[]): PortListener[] {
  const seen = new Set<string>();
  const out: PortListener[] = [];
  for (const row of rows) {
    const key = listenerKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => {
    if (a.port !== b.port) return a.port - b.port;
    if (a.protocol !== b.protocol) return a.protocol.localeCompare(b.protocol);
    const hostA = a.wslDistro ?? "";
    const hostB = b.wslDistro ?? "";
    if (hostA !== hostB) return hostA.localeCompare(hostB);
    const addr = a.address.localeCompare(b.address);
    if (addr !== 0) return addr;
    return a.pid - b.pid;
  });
  return out;
}

export function filterListeners(rows: PortListener[], port: number | null): PortListener[] {
  if (port == null) return rows.filter((row) => row.protocol === "tcp");
  return rows.filter((row) => row.port === port);
}

export function parseTasklistCsv(stdout: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const m = line.match(/^"([^"]+)","(\d+)"/u);
    if (!m) continue;
    const name = m[1];
    const pidText = m[2];
    if (!name || !pidText) continue;
    map.set(Number(pidText), name);
  }
  return map;
}

export function attachProcessNames(
  rows: Array<Omit<PortListener, "processName"> & { processName?: string }>,
  names: Map<number, string>,
): PortListener[] {
  return rows.map((row) => ({
    protocol: row.protocol,
    port: row.port,
    address: row.address,
    pid: row.pid,
    processName: names.get(row.pid) || row.processName || `pid ${String(row.pid)}`,
  }));
}

function asProtocol(value: string): PortProtocol | null {
  const p = value.toLowerCase();
  if (p === "tcp" || p === "tcpv6") return "tcp";
  if (p === "udp" || p === "udpv6") return "udp";
  return null;
}

export function parseNetstatAno(stdout: string): ParsedSocket[] {
  const rows: ParsedSocket[] = [];
  for (const raw of stdout.split(/\r?\n/u)) {
    const parts = raw.trim().split(/\s+/u);
    if (parts.length < 4) continue;
    const protocol = asProtocol(parts[0] ?? "");
    if (!protocol) continue;
    const pid = Number(parts[parts.length - 1]);
    if (!Number.isInteger(pid) || pid < 0) continue;
    const local = parts[1];
    if (!local) continue;
    const loc = splitHostPort(local);
    if (!loc) continue;
    let state: string | null = null;
    if (protocol === "tcp") {
      if (parts.length < 5) continue;
      state = parts[parts.length - 2] ?? null;
    }
    rows.push({
      protocol,
      address: loc.address,
      port: loc.port,
      pid,
      state,
    });
  }
  return rows;
}

export function netstatToListeners(rows: ParsedSocket[]): Array<Omit<PortListener, "processName">> {
  return rows
    .filter((row) => row.protocol === "udp" || isListenState(row.state))
    .map((row) => ({
      protocol: row.protocol,
      port: row.port,
      address: row.address,
      pid: row.pid,
    }));
}

function parseSockName(name: string): { address: string; port: number } | null {
  let s = name.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  const arrow = s.indexOf("->");
  if (arrow >= 0) s = s.slice(0, arrow);
  s = s.replace(/^(TCP|UDP)\s+/iu, "");
  return splitHostPort(s);
}

export function parseLsofFields(stdout: string): PortListener[] {
  const out: PortListener[] = [];
  let pid = 0;
  let command = "";
  let proto: PortProtocol | null = null;
  let name = "";
  let state = "";

  const flushFile = (): void => {
    if (pid > 0 && name) {
      const loc = parseSockName(name);
      if (loc) {
        const protocol = proto ?? (state ? "tcp" : "udp");
        const listen = protocol === "udp" || isListenState(state) || /\(LISTEN\)/iu.test(name);
        if (listen) {
          out.push({
            protocol,
            port: loc.port,
            address: loc.address,
            pid,
            processName: command || `pid ${String(pid)}`,
          });
        }
      }
    }
    proto = null;
    name = "";
    state = "";
  };

  for (const raw of stdout.split(/\r?\n/u)) {
    if (!raw) continue;
    const code = raw[0];
    const value = raw.slice(1);
    switch (code) {
      case "p":
        flushFile();
        pid = Number(value);
        command = "";
        break;
      case "c":
        command = value;
        break;
      case "f":
        flushFile();
        break;
      case "P": {
        const parsed = asProtocol(value);
        if (parsed) proto = parsed;
        break;
      }
      case "n":
        name = value;
        break;
      case "T":
        if (value.startsWith("ST=")) state = value.slice(3);
        break;
      default:
        break;
    }
  }
  flushFile();
  return out;
}

export type ParseSsOptions = {
  /** Keep rows without `users:((…))` — non-root `ss` cannot see other users' sockets. */
  allowMissingPid?: boolean;
};

/** Drop an interface scope (`127.0.0.53%lo:53`, `[fe80::1%eth0]:546`). */
function stripScopeId(local: string): string {
  return local.replace(/%[^:\]\s]+(?=\]?:\d+$)/u, "");
}

/**
 * Parse `ss -l[tu]n[p][H]` output. The leading Netid column (`tcp LISTEN …`,
 * printed when several protocols are requested) is optional, and a header row
 * (old `ss` without `-H`) is skipped because it does not match.
 */
export function parseSsListen(stdout: string, options: ParseSsOptions = {}): PortListener[] {
  const out: PortListener[] = [];
  for (const raw of stdout.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(
      /^(?:(tcp6?|udp6?)\s+)?(LISTEN|UNCONN)\s+\S+\s+\S+\s+(\S+)\s+\S+(?:\s+users:\(\((.*)\)\))?\s*$/iu,
    );
    if (!m) continue;
    const local = m[3];
    if (!local) continue;
    const loc = splitHostPort(stripScopeId(local));
    if (!loc) continue;
    // Optional capture groups are undefined at runtime when they did not match.
    const netid = (m[1] as string | undefined)?.toLowerCase();
    const state = (m[2] as string | undefined)?.toUpperCase();
    const protocol: PortProtocol = netid
      ? netid.startsWith("udp")
        ? "udp"
        : "tcp"
      : state === "UNCONN"
        ? "udp"
        : "tcp";
    let pid = 0;
    let processName = "";
    const users = m[4];
    if (users) {
      const um = users.match(/"([^"]+)",pid=(\d+)/u);
      if (um) {
        const name = um[1];
        const pidText = um[2];
        if (name) processName = name;
        if (pidText) pid = Number(pidText);
      }
    }
    if (!Number.isInteger(pid) || pid < 0) continue;
    if (pid < 1 && !options.allowMissingPid) continue;
    out.push({
      protocol,
      port: loc.port,
      address: loc.address,
      pid,
      processName: processName || (pid > 0 ? `pid ${String(pid)}` : ""),
    });
  }
  return out;
}

/** `/proc/net/tcp` stores each 32-bit word in host (little-endian) byte order. */
function procHexWord(word: string): string {
  return [6, 4, 2, 0].map((i) => word.slice(i, i + 2)).join("");
}

function procHexToAddress(hex: string): string | null {
  if (/^[0-9a-f]{8}$/iu.test(hex)) {
    const be = procHexWord(hex);
    return [0, 2, 4, 6].map((i) => String(parseInt(be.slice(i, i + 2), 16))).join(".");
  }
  if (/^[0-9a-f]{32}$/iu.test(hex)) {
    const groups: number[] = [];
    for (let w = 0; w < 4; w += 1) {
      const be = procHexWord(hex.slice(w * 8, w * 8 + 8));
      groups.push(parseInt(be.slice(0, 4), 16), parseInt(be.slice(4, 8), 16));
    }
    if (groups.every((g) => g === 0)) return "::";
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return "::1";
    // IPv4-mapped (::ffff:a.b.c.d)
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
      const a = groups[6] ?? 0;
      const b = groups[7] ?? 0;
      return `::ffff:${String(a >> 8)}.${String(a & 0xff)}.${String(b >> 8)}.${String(b & 0xff)}`;
    }
    return groups.map((g) => g.toString(16)).join(":");
  }
  return null;
}

/**
 * Parse `/proc/net/tcp` + `/proc/net/tcp6` (concatenated) for LISTEN sockets
 * (`st == 0A`). Fallback when `ss` is not installed — no pid / process name.
 */
export function parseProcNetTcp(stdout: string): PortListener[] {
  const out: PortListener[] = [];
  for (const raw of stdout.split(/\r?\n/u)) {
    const parts = raw.trim().split(/\s+/u);
    if (parts.length < 4 || !/^\d+:$/u.test(parts[0] ?? "")) continue;
    if ((parts[3] ?? "").toUpperCase() !== "0A") continue;
    const local = parts[1] ?? "";
    const sep = local.lastIndexOf(":");
    if (sep <= 0) continue;
    const port = parseInt(local.slice(sep + 1), 16);
    if (!isPortNumber(port)) continue;
    const address = procHexToAddress(local.slice(0, sep));
    if (!address) continue;
    out.push({ protocol: "tcp", port, address, pid: 0, processName: "" });
  }
  return out;
}

