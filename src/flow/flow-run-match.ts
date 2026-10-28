import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runDirMatchesFlow } from "../shared/flow-run-id.js";

function readStateFlowId(runDir: string): string | null {
  const statePath = join(runDir, "state.json");
  if (!existsSync(statePath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (parsed && typeof parsed === "object") {
      const flowId = (parsed as { flowId?: unknown }).flowId;
      if (typeof flowId === "string") return flowId;
    }
  } catch {
    // Unreadable state: fall back to structural name matching.
  }
  return null;
}

/** Names of run directories under `runsRoot` that belong to `flowId` (unsorted). */
export function listRunDirNamesForFlow(runsRoot: string, flowId: string): string[] {
  if (!flowId || !existsSync(runsRoot)) return [];
  const suffix = `-${flowId}`;
  return readdirSync(runsRoot, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        // Cheap pre-filter: every candidate ends with the id; skip reading other runs' state.
        d.name.endsWith(suffix) &&
        runDirMatchesFlow(d.name, flowId, readStateFlowId(join(runsRoot, d.name))),
    )
    .map((d) => d.name);
}
