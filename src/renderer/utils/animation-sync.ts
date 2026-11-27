/** The part of `Element` this module needs, so it can be tested without a DOM. */
export type AnimatableLike = {
  getAnimations?: () => ReadonlyArray<{ startTime: unknown }>;
};

/**
 * Pin an element's running CSS animations to the document timeline origin.
 *
 * A CSS animation starts when its element mounts, so a looping pulse that is
 * remounted (profile switch, layout change) restarts from frame 0 and visibly
 * jumps. With `startTime = 0` every such animation shares one phase, whenever
 * its element was created: a remount continues where the pulse already was,
 * and all pulses on screen beat together.
 */
export function alignAnimationsToTimeline(el: AnimatableLike | null | undefined): void {
  if (!el?.getAnimations) return;
  for (const animation of el.getAnimations()) {
    if (animation.startTime !== 0) animation.startTime = 0;
  }
}
