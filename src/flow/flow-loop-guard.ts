/**
 * Loop guard for the node orchestrator.
 *
 * `next:` / `on_fail:` / `on_reject:` may point back to an earlier phase, so a
 * flow can cycle. Every phase visit can spawn a paid agent run, so the
 * orchestrator caps the total number of phase visits per run.
 *
 * Retries (`retry:`) happen inside a single visit and are not counted here.
 */

/** Visits allowed per phase, on average, before a run is treated as looping. */
export const PHASE_VISITS_PER_PHASE = 3;

/** Maximum total phase visits allowed in one run of a flow with `phaseCount` phases. */
export function maxPhaseVisits(phaseCount: number): number {
  return Math.max(1, phaseCount) * PHASE_VISITS_PER_PHASE;
}

/**
 * Returns the loop error for a run about to make its `visitCount`-th phase visit
 * (1-based, counting this one), or `null` when the visit is within bounds.
 */
export function phaseLoopError(
  visitCount: number,
  phaseCount: number,
  phaseId: string,
): string | null {
  const limit = maxPhaseVisits(phaseCount);
  if (visitCount <= limit) return null;
  return `Phase loop detected: phase "${phaseId}" would be phase execution #${visitCount}, exceeding the limit of ${limit} for ${phaseCount} phase(s)`;
}
