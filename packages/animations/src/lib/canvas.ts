import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * DPR-aware canvas setup.
 *
 * Sizes the canvas backing store to `width` x `height` CSS pixels multiplied by
 * `devicePixelRatio`, then scales the 2D context so all drawing code can work in
 * logical (CSS) coordinates and still render crisply on high-DPI displays.
 *
 * Returns the configured 2D context, or `null` if it could not be obtained.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  // Draw in logical pixels; the transform maps them onto the DPR-scaled store.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Arguments passed to a {@link useCanvasAnimation} draw callback each frame. */
export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** Logical (CSS-pixel) width the context is set up to draw in. */
  width: number;
  /** Logical (CSS-pixel) height the context is set up to draw in. */
  height: number;
  /** Total elapsed running time in seconds (frozen while paused/inactive). */
  elapsed: number;
  /** Delta since the previous frame in seconds (clamped, 0 on a frozen frame). */
  dt: number;
  /** Monotonically increasing frame counter. */
  frame: number;
}

export interface UseCanvasAnimationOptions {
  /** Logical canvas width in CSS pixels. */
  width: number;
  /** Logical canvas height in CSS pixels. */
  height: number;
  /** Per-frame draw callback. */
  draw: (frame: CanvasFrame) => void;
  /** When true, the loop stops and a single frozen frame is drawn. */
  paused?: boolean;
  /** When false, the loop stops (e.g. driven by {@link useInView}). */
  active?: boolean;
}

/**
 * requestAnimationFrame loop for a canvas, wrapping DPR setup, elapsed-time
 * accumulation, pause/active gating, and cleanup.
 *
 * The returned ref must be attached to a `<canvas>` element. Elapsed time only
 * advances while the animation is both un-paused and active, so pausing or
 * scrolling out of view freezes the visual rather than resetting it.
 */
export function useCanvasAnimation(
  options: UseCanvasAnimationOptions,
): RefObject<HTMLCanvasElement | null> {
  const { width, height, draw, paused = false, active = true } = options;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest draw callback without re-subscribing the effect each render.
  const drawRef = useRef(draw);
  drawRef.current = draw;
  // Persist across pause/resume and effect re-runs so time never jumps back.
  const elapsedRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = setupCanvas(canvas, width, height);
    if (!ctx) return;

    const paint = (dt: number) => {
      drawRef.current({
        ctx,
        width,
        height,
        elapsed: elapsedRef.current,
        dt,
        frame: frameRef.current,
      });
    };

    // Frozen: draw one static frame and stop.
    if (paused || !active) {
      paint(0);
      return;
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      // Clamp dt to avoid large jumps after tab-switch / long frames.
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      elapsedRef.current += dt;
      frameRef.current += 1;
      paint(dt);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height, paused, active]);

  return canvasRef;
}

export interface UseInViewOptions {
  /** Visibility ratio at which the element counts as in view. */
  threshold?: number;
  /** When true, stop observing after the first time it enters view. */
  once?: boolean;
}

/**
 * IntersectionObserver hook so animations only run while visible.
 *
 * By default `inView` tracks visibility continuously (true when on screen,
 * false when scrolled away) so animation loops can idle off-screen. Pass
 * `once: true` to latch to true on first entry.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {},
): { ref: RefObject<T | null>; inView: boolean } {
  const { threshold = 0.2, once = false } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (e.g. SSR/older env): assume visible.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  return { ref, inView };
}
