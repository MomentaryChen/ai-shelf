import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";

const PREF_FILE = "flow-schedule-pref.json";

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
  writeFileSync(prefPath(), JSON.stringify(store, null, 2), "utf8");
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
