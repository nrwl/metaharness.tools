import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Fit a fixed logical stage to whatever width the container ends up with.
 *
 * The scale is applied with `zoom`, not `transform: scale()`, on purpose:
 * `transform` is a paint-time effect, so a transformed 720x480 stage still
 * occupies 720x480 in layout. Anything centring against it (a two-column grid
 * with `items-center`, say) lines up against the unscaled box and reads as
 * badly aligned. `zoom` participates in layout, so the box a diagram occupies
 * is the box you can see.
 *
 * `scale` is null until the first measurement. Callers should keep the stage
 * hidden until then — a fixed-width stage painted before it has been measured
 * blows out to its logical width and then snaps back, which reads as the whole
 * diagram stretching on page load.
 */
export function useStageScale<T extends HTMLElement>(
  stageW: number,
): { ref: RefObject<T | null>; scale: number | null } {
  const ref = useRef<T>(null);
  const [scale, setScale] = useState<number | null>(null);

  // Layout effect, not effect: measure and scale before the browser paints the
  // hydrated tree, so there is no intermediate frame at the wrong size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / stageW);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageW]);

  return { ref, scale };
}
