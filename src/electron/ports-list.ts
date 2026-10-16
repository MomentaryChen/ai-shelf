import { platform } from "node:os";
import { run } from "../utils/exec.js";
import {
  attachProcessNames,
  dedupeAndSortListeners,
  parseLsofFields,
  parseNetstatAno,
  parseProcNetTcp,
  parseSsListen,
  parseTasklistCsv,
  netstatToListeners,
  type PortListener,
  type WslPortScan,
} from "../shared/port-listeners.js";
import { listRunningWslDistros, runWsl } from "./wsl-exec.js";

async function listWindows(): Promise<PortListener[]> {
  const netstat = await run("netstat", ["-ano"], 15_000);
  if (!netstat.stdout.trim()) {
    throw new Error(netstat.stderr || "netstat returned no output");
  }
  const sockets = netstatToListeners(parseNetstatAno(netstat.stdout));
  const tasklist = await run("tasklist", ["/FO", "CSV", "/NH"], 15_000);
  return attachProcessNames(sockets, parseTasklistCsv(tasklist.stdout));
}

async function listLsof(port: number | null): Promise<PortListener[]> {
  const tcp = await run("lsof", ["-nP", "-F", "pcPnT", "-iTCP", "-sTCP:LISTEN"], 15_000);
  if (!tcp.stdout.trim() && !tcp.ok) {
    throw new Error(tcp.stderr || "lsof failed");
  }
  const rows = parseLsofFields(tcp.stdout);
  if (port == null) return rows;
  const udp = await run("lsof", ["-nP", "-F", "pcPn", `-iUDP:${String(port)}`], 15_000);
  return [...rows, ...parseLsofFields(udp.stdout)];
}

async function listUnix(port: number | null): Promise<PortListener[]> {
  if (platform() === "linux") {
    const ss = await run("ss", ["-lptunH"], 15_000);
    if (ss.ok && ss.stdout.trim()) return parseSsListen(ss.stdout);
  }
  return listLsof(port);
}

export async function listAllListeners(port: number | null): Promise<PortListener[]> {
  const rows = platform() === "win32" ? await listWindows() : await listUnix(port);
  return dedupeAndSortListeners(rows);
}

const WSL_PORTS_TIMEOUT_MS = 5_000;

async function listOneWslDistro(distro: string): Promise<WslPortScan & { rows: PortListener[] }> {
  const ss = await runWsl(["-d", distro, "--exec", "ss", "-ltnp"], {
    encoding: "utf8",
    timeoutMs: WSL_PORTS_TIMEOUT_MS,
  });
  let rows: PortListener[] | null = null;
  let error = "";
  if (ss.ok) {
    rows = parseSsListen(String(ss.stdout), { allowMissingPid: true });
  } else {
    error = ss.error;
    // Minimal images (no iproute2): read the kernel tables directly.
    const proc = await runWsl(
      ["-d", distro, "--exec", "sh", "-c", "cat /proc/net/tcp /proc/net/tcp6 2>/dev/null; true"],
      { encoding: "utf8", timeoutMs: WSL_PORTS_TIMEOUT_MS },
    );
    if (proc.ok) rows = parseProcNetTcp(String(proc.stdout));
    else error = proc.error || error;
  }
  if (!rows) return { distro, ok: false, error: error || "wsl.exe failed", count: 0, rows: [] };
  const tagged = rows.map((row) => ({
    ...row,
    processName: row.processName || (row.pid > 0 ? `pid ${String(row.pid)}` : "?"),
    wslDistro: distro,
  }));
  return { distro, ok: true, count: tagged.length, rows: tagged };
}

/**
 * Listening TCP sockets inside each *running* WSL distro (Windows only).
 * Stopped distros are never started; a slow or broken distro only fails its own row.
 */
export async function listWslListeners(): Promise<{
  listeners: PortListener[];
  distros: WslPortScan[];
}> {
  if (platform() !== "win32") return { listeners: [], distros: [] };
  const running = await listRunningWslDistros();
  if (running.length === 0) return { listeners: [], distros: [] };
  const scans = await Promise.all(running.map((distro) => listOneWslDistro(distro)));
  return {
    listeners: dedupeAndSortListeners(scans.flatMap((scan) => scan.rows)),
    distros: scans.map((scan) => ({
      distro: scan.distro,
      ok: scan.ok,
      count: scan.count,
      ...(scan.error ? { error: scan.error } : {}),
    })),
  };
}
