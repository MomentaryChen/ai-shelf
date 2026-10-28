/**
 * Run directory names are `<YYYYMMDD>-<HHMMSS>-<uniq>-<flowId>` (current) or
 * `<YYYYMMDD>-<HHMMSS>-<flowId>` (legacy, before the 4-char uniq segment).
 * Flow ids may contain `-`, so a plain `endsWith(`-${flowId}`)` check would let
 * flow `review` claim runs of `multi-agent-review`.
 */
const RUN_STAMP_PREFIX = /^\d{8}-\d{6}-(?=.)/;
const RUN_UNIQ_SEGMENT = /^[a-z0-9]{4}-./;

/**
 * Pure check whether a run directory belongs to `flowId`.
 * When the run's `state.json` recorded a `flowId`, that value is authoritative;
 * otherwise the directory name is parsed structurally and compared exactly.
 * Names without the timestamp prefix are ignored.
 */
export function runDirMatchesFlow(
  dirName: string,
  flowId: string,
  stateFlowId?: string | null,
): boolean {
  if (!flowId) return false;
  const stamped = RUN_STAMP_PREFIX.exec(dirName);
  if (!stamped) return false;
  if (typeof stateFlowId === "string" && stateFlowId.trim()) {
    return stateFlowId === flowId;
  }
  const rest = dirName.slice(stamped[0].length);
  if (rest === flowId) return true; // legacy name without uniq segment
  return RUN_UNIQ_SEGMENT.test(rest) && rest.slice(5) === flowId;
}
