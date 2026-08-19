import type { PortListener } from "./port-listeners.js";

export type HostGpuSnapshot = {
  name: string;
  usagePercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
};

export type HostResourceSnapshot = {
  capturedAt: string;
  platform: string;
  release: string;
  arch: string;
  cpu: {
    model: string;
    cores: number;
    usagePercent: number | null;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
  };
  network: {
    rxBytesPerSec: number | null;
    txBytesPerSec: number | null;
  };
  gpu: HostGpuSnapshot | null;
};

export type HostEnvSnapshot = HostResourceSnapshot & {
  listeners: PortListener[];
};

const MAX_LISTENERS_IN_SNAPSHOT = 40;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${String(Math.round(bytes / 1024))} KB`;
}

export function formatBytesPerSec(bytesPerSec: number | null): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec)) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatMemoryPair(usedBytes: number, totalBytes: number): string {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return "—";
  const gb = 1024 * 1024 * 1024;
  if (totalBytes >= gb) {
    return `${(usedBytes / gb).toFixed(1)} / ${(totalBytes / gb).toFixed(1)} GB`;
  }
  const mb = 1024 * 1024;
  return `${(usedBytes / mb).toFixed(0)} / ${(totalBytes / mb).toFixed(0)} MB`;
}

export function memoryPercent(usedBytes: number, totalBytes: number): number | null {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  return Math.round((usedBytes / totalBytes) * 1000) / 10;
}

export function parseNetstatE(stdout: string): { rx: number; tx: number } | null {
  const m = stdout.match(/^Bytes\s+(\d+)\s+(\d+)/imu);
  if (!m) return null;
  const rx = Number(m[1]);
  const tx = Number(m[2]);
  if (!Number.isFinite(rx) || !Number.isFinite(tx)) return null;
  return { rx, tx };
}

export function parseProcNetDev(stdout: string): { rx: number; tx: number } | null {
  let rx = 0;
  let tx = 0;
  let any = false;
  for (const raw of stdout.split(/\r?\n/u)) {
    const line = raw.trim();
    const m = line.match(/^(\S+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/u);
    if (!m) continue;
    const name = m[1];
    if (!name || name === "lo" || name.startsWith("veth") || name.startsWith("br-") || name.startsWith("docker")) {
      continue;
    }
    rx += Number(m[2]);
    tx += Number(m[3]);
    any = true;
  }
  return any ? { rx, tx } : null;
}

export function parseNetstatIb(stdout: string): { rx: number; tx: number } | null {
  const lines = stdout.split(/\r?\n/u).filter((l) => l.trim());
  const header = lines[0];
  if (!header) return null;
  const cols = header.trim().split(/\s+/u);
  const ibytes = cols.findIndex((c) => c.toLowerCase() === "ibytes");
  const obytes = cols.findIndex((c) => c.toLowerCase() === "obytes");
  const nameIdx = cols.findIndex((c) => c.toLowerCase() === "name");
  if (ibytes < 0 || obytes < 0) return null;
  let rx = 0;
  let tx = 0;
  let any = false;
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/u);
    const name = nameIdx >= 0 ? (parts[nameIdx] ?? "") : (parts[0] ?? "");
    if (name.startsWith("lo")) continue;
    const r = Number(parts[ibytes]);
    const t = Number(parts[obytes]);
    if (!Number.isFinite(r) || !Number.isFinite(t)) continue;
    rx += r;
    tx += t;
    any = true;
  }
  return any ? { rx, tx } : null;
}

export function parseNvidiaSmi(stdout: string): HostGpuSnapshot | null {
  const line = stdout.split(/\r?\n/u).map((l) => l.trim()).find((l) => l);
  if (!line) return null;
  const parts = line.split(",").map((p) => p.trim());
  const name = parts[0];
  if (!name) return null;
  const usage = parts[1] ? Number(parts[1]) : NaN;
  const memUsedMiB = parts[2] ? Number(parts[2]) : NaN;
  const memTotalMiB = parts[3] ? Number(parts[3]) : NaN;
  return {
    name,
    usagePercent: Number.isFinite(usage) ? usage : null,
    memoryUsedBytes: Number.isFinite(memUsedMiB) ? memUsedMiB * 1024 * 1024 : null,
    memoryTotalBytes: Number.isFinite(memTotalMiB) ? memTotalMiB * 1024 * 1024 : null,
  };
}

export function formatHostEnvMarkdown(snapshot: HostEnvSnapshot): string {
  const listeners = snapshot.listeners.slice(0, MAX_LISTENERS_IN_SNAPSHOT);
  const extra = snapshot.listeners.length - listeners.length;
  const listenerLines = listeners.map(
    (row) =>
      `- ${row.protocol} ${row.address}:${String(row.port)}  pid ${String(row.pid)}  ${row.processName}`,
  );
  if (extra > 0) listenerLines.push(`- … ${String(extra)} more`);

  const gpu = snapshot.gpu
    ? [
        `- name: ${snapshot.gpu.name}`,
        `- usage: ${snapshot.gpu.usagePercent == null ? "—" : `${String(snapshot.gpu.usagePercent)}%`}`,
        `- memory: ${
          snapshot.gpu.memoryUsedBytes == null || snapshot.gpu.memoryTotalBytes == null
            ? "—"
            : `${formatBytes(snapshot.gpu.memoryUsedBytes)} / ${formatBytes(snapshot.gpu.memoryTotalBytes)}`
        }`,
      ].join("\n")
    : "- not detected";

  return [
    `captured: ${snapshot.capturedAt}`,
    `os: ${snapshot.platform} ${snapshot.release} (${snapshot.arch})`,
    `cpu: ${snapshot.cpu.model} × ${String(snapshot.cpu.cores)}`,
    `cpu usage: ${snapshot.cpu.usagePercent == null ? "—" : `${String(snapshot.cpu.usagePercent)}%`}`,
    `memory: ${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}`,
    `network: ↓ ${formatBytesPerSec(snapshot.network.rxBytesPerSec)}  ↑ ${formatBytesPerSec(snapshot.network.txBytesPerSec)}`,
    "gpu:",
    gpu,
    "listeners:",
    listenerLines.length > 0 ? listenerLines.join("\n") : "- none",
  ].join("\n");
}

export function buildEnvAnalyzePrompt(snapshot: HostEnvSnapshot, locale: "en" | "zh"): string {
  const language = locale === "zh" ? "Traditional Chinese" : "English";
  return [
    "Write a concise Markdown report of this developer machine.",
    `Language: ${language}.`,
    "",
    "Cover:",
    "- Overall state (calm, busy, or concerning)",
    "- CPU, memory, network, and GPU (say if GPU was not detected)",
    "- Notable listening ports — especially 3000, 5173, 8080, and other dev servers",
    "- Practical next steps (what to stop, what looks fine)",
    "",
    "Rules:",
    "- Use only numbers from the snapshot. Do not invent metrics.",
    "- Keep it under 400 words.",
    "- No apology, no marketing tone.",
    "",
    "Snapshot:",
    "```",
    formatHostEnvMarkdown(snapshot),
    "```",
  ].join("\n");
}

export function extractReportMarkdown(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/u);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

export { MAX_LISTENERS_IN_SNAPSHOT };
