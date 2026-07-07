import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";

const PREF_FILE = "flow-schedule-pref.json";
const SLOT_CLAIMS_DIR = "flow-slot-claims";
const SLOT_CLAIM_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export type FlowSchedulePrefs = {
  /** In-app cron tick (every minute while AI Shelf is running). */
  schedulerEnabled: boolean;
};

export type FlowScheduleStore = FlowSchedulePrefs & {
  /** flowId → cron slot key (minute precision) last started. */
  lastSlots: Record<string, string>;
};

export const DEFAULT_FLOW_SCHEDULE_PREFS: FlowSchedulePrefs = {
  schedulerEnabled: true,
};

function prefPath(): string {
  return join(getAppDataDir(), PREF_FILE);
}

function readStore(): FlowScheduleStore {
  try {
    const path = prefPath();
    if (!existsSync(path)) {
      return { ...DEFAULT_FLOW_SCHEDULE_PREFS, lastSlots: {} };
    }
    const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<FlowScheduleStore>;
    return {
      schedulerEnabled: data.schedulerEnabled !== false,
      lastSlots:
        data.lastSlots && typeof data.lastSlots === "object" ? { ...data.lastSlots } : {},
    };
  } catch {
    return { ...DEFAULT_FLOW_SCHEDULE_PREFS, lastSlots: {} };
  }
}

function writeStore(store: FlowScheduleStore): void {
  const dir = getAppDataDir();
  mkdirSync(dir, { recursive: true });
  // Write-then-rename so a concurrent reader never sees a half-written file.
  const path = prefPath();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, path);
}

export function readFlowSchedulePrefs(): FlowSchedulePrefs {
  const { schedulerEnabled } = readStore();
  return { schedulerEnabled };
}

export function writeFlowSchedulePrefs(partial: Partial<FlowSchedulePrefs>): FlowSchedulePrefs {
  const store = readStore();
  const next: FlowScheduleStore = {
    ...store,
    schedulerEnabled:
      partial.schedulerEnabled !== undefined
        ? partial.schedulerEnabled
        : store.schedulerEnabled,
  };
  writeStore(next);
  return { schedulerEnabled: next.schedulerEnabled };
}

export function readFlowLastSlot(flowId: string): string | null {
  const slot = readStore().lastSlots[flowId];
  return typeof slot === "string" ? slot : null;
}

export function writeFlowLastSlot(flowId: string, slotKey: string): void {
  const store = readStore();
  store.lastSlots[flowId] = slotKey;
  writeStore(store);
}

function slotClaimsDir(): string {
  return join(getAppDataDir(), SLOT_CLAIMS_DIR);
}

function slotClaimPath(flowId: string, slotKey: string): string {
  const safeSlot = slotKey.replace(/[^0-9A-Za-z-]/g, "-");
  return join(slotClaimsDir(), `${flowId}--${safeSlot}.claim`);
}

function pruneStaleSlotClaims(dir: string): void {
  try {
    const cutoff = Date.now() - SLOT_CLAIM_MAX_AGE_MS;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".claim")) continue;
      const path = join(dir, name);
      try {
        if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
      } catch {
        /* claimed/removed by another process */
      }
    }
  } catch {
    /* best-effort prune */
  }
}

/**
 * Atomically claim a cron slot for a flow across processes (in-app scheduler
 * vs headless `cli.js due`). Exclusive file creation is the lock: the first
 * process to create the claim file runs the flow; everyone else skips.
 */
export function claimFlowScheduleSlot(flowId: string, slotKey: string): boolean {
  const dir = slotClaimsDir();
  mkdirSync(dir, { recursive: true });
  pruneStaleSlotClaims(dir);
  try {
    writeFileSync(
      slotClaimPath(flowId, slotKey),
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      { flag: "wx" },
    );
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") return false;
    // Unexpected FS error: fall back to the lastSlots dedup rather than
    // silently never running the flow.
    return true;
  }
}
