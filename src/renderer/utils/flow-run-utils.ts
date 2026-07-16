import type { FlowRunStatus } from "../../shared/flow-types.js";

export function formatRunDuration(startedAt: string, updatedAt: string, status: FlowRunStatus): string {
  const start = Date.parse(startedAt);
  const end =
    status === "running" || status === "pending" || status === "waiting_approval"
      ? Date.now()
      : Date.parse(updatedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${hr}h ${m}m` : `${hr}h`;
}

export function formatRunTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatOutputDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function runStatusTone(
  status: FlowRunStatus,
): "success" | "failed" | "running" | "neutral" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "failed";
    case "running":
    case "waiting_approval":
      return "running";
    default:
      return "neutral";
  }
}
