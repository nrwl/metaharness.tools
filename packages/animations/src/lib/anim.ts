/**
 * Shared math / easing / PRNG helpers used by the animation kernels.
 * Kernels are pure draw modules (no React), so everything here is also pure.
 */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth (eased) 0->1 ramp between edges a and b. */
export function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Cubic ease in/out over an already-normalized 0..1 value. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Ease-out with a slight back overshoot, for pop-in effects. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * mulberry32: tiny deterministic PRNG. Same seed -> same sequence, so layouts
 * generated at module init are reproducible across sessions and environments.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Pt {
  x: number;
  y: number;
}

/** Idle drift for an element: a small, per-seed Lissajous wobble. */
export function drift(seed: number, elapsed: number, amp = 2.4): Pt {
  const fx = 0.5 + seed * 0.6;
  const fy = 0.42 + seed * 0.45;
  return {
    x: amp * Math.sin(elapsed * fx + seed * 6.283),
    y: amp * Math.cos(elapsed * fy + seed * 4.1),
  };
}

/** Rounded-rectangle path (does not stroke/fill). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Options every animation kernel receives per frame. */
export interface KernelFrame {
  width: number;
  height: number;
  /** Kernel-local elapsed seconds (caller owns the clock). */
  elapsed: number;
  /**
   * Global 0..1 fade/scale for the explode transition (already eased by the
   * caller). 1 when the kernel runs standalone.
   */
  appear: number;
}
