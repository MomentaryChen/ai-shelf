import { platform } from "node:os";
import { run } from "../utils/exec.js";
import {
  attachProcessNames,
  dedupeAndSortListeners,
  parseLsofFields,
  parseNetstatAno,
  parseSsListen,
  parseTasklistCsv,
  netstatToListeners,
  type PortListener,
} from "../shared/port-listeners.js";

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
