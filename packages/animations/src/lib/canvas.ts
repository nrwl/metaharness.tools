import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { clamp01, easeInOut, lerp } from './anim';

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
  /** Stop and freeze once elapsed reaches this many seconds. */
  stopAt?: number;
  /**
   * Opaque value that forces a repaint when it changes (in addition to the
   * running loop). Pass the theme mode so a paused/frozen frame re-draws with
   * the new palette the moment the user flips the toggle.
   */
  redrawKey?: string | number;
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
  const {
    width,
    height,
    draw,
    paused = false,
    active = true,
    stopAt,
    redrawKey,
  } = options;

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

    if (stopAt !== undefined && elapsedRef.current >= stopAt) {
      elapsedRef.current = stopAt;
      paint(0);
      return;
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      // Clamp dt to avoid large jumps after tab-switch / long frames.
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const nextElapsed = elapsedRef.current + dt;
      const shouldStop = stopAt !== undefined && nextElapsed >= stopAt;
      const frameDt = shouldStop ? Math.max(0, stopAt - elapsedRef.current) : dt;
      elapsedRef.current = shouldStop ? stopAt : nextElapsed;
      frameRef.current += 1;
      paint(frameDt);
      if (shouldStop) return;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height, paused, active, stopAt, redrawKey]);

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

/** Toggle side for a before/after morph animation. */
export type MorphMode = 'auto' | 'before' | 'after';

export interface UseMorphToggleOptions {
  /**
   * 'auto' (default) shows an interactive switch that also auto-cycles while
   * in view until the user interacts; 'before'/'after' pin the morph to one
   * end (non-interactive) for stories and the site's fixed placements.
   */
  mode?: MorphMode;
  /** Whether the animation is on screen (gates auto-cycling). */
  inView: boolean;
  /** Seconds for the eased before<->after tween. */
  duration?: number;
  /** Seconds between auto toggles while in view, before any interaction. */
  autoInterval?: number;
}

export interface MorphToggle {
  /**
   * Eased 0..1 morph progress for the given frame elapsed time. Call once per
   * draw; it also records `elapsed` so toggles can start their tween from the
   * current frame.
   */
  progressAt: (elapsed: number) => number;
  /** Logical target side for the switch UI (true = "after"). */
  after: boolean;
  /** True when the switch is pinned (mode !== 'auto') and non-interactive. */
  disabled: boolean;
  /** Whether the user has taken over from the auto-cycle. */
  interacted: boolean;
  /** Flip the switch (marks the animation as user-driven). */
  onToggle: () => void;
}

/**
 * Drives the shared before/after morph mechanic: a single 0..1 `progress`
 * tweened with an ease-in-out cubic when toggled, an auto-cycle that flips it
 * on an interval while in view until the user interacts, and pinned
 * before/after modes for stories.
 *
 * Progress is derived from the frame `elapsed` (passed to {@link progressAt}),
 * so it freezes cleanly whenever the host loop pauses or scrolls off screen.
 */
export function useMorphToggle(options: UseMorphToggleOptions): MorphToggle {
  const { mode = 'auto', inView, duration = 0.9, autoInterval = 5 } = options;
  const pinned = mode !== 'auto';
  const pinnedAfter = mode === 'after';

  const [after, setAfter] = useState(pinnedAfter);
  const [interacted, setInteracted] = useState(false);

  // Tween bookkeeping (refs so the draw loop and interval read live values).
  const elapsedRef = useRef(0);
  const fromRef = useRef(pinnedAfter ? 1 : 0);
  const toRef = useRef(pinnedAfter ? 1 : 0);
  const startRef = useRef(0);
  const progressRef = useRef(pinnedAfter ? 1 : 0);
  const afterRef = useRef(pinnedAfter);

  const setTarget = useCallback(
    (next: boolean) => {
      fromRef.current = progressRef.current;
      toRef.current = next ? 1 : 0;
      startRef.current = elapsedRef.current;
      afterRef.current = next;
      setAfter(next);
    },
    [],
  );

  // Auto-cycle: only while in view, before interaction, and not pinned.
  useEffect(() => {
    if (pinned || interacted || !inView) return;
    const id = setInterval(
      () => setTarget(!afterRef.current),
      autoInterval * 1000,
    );
    return () => clearInterval(id);
  }, [pinned, interacted, inView, autoInterval, setTarget]);

  const progressAt = useCallback(
    (elapsed: number) => {
      elapsedRef.current = elapsed;
      if (pinned) {
        progressRef.current = pinnedAfter ? 1 : 0;
        return progressRef.current;
      }
      const u =
        duration <= 0 ? 1 : clamp01((elapsed - startRef.current) / duration);
      const p = lerp(fromRef.current, toRef.current, easeInOut(u));
      progressRef.current = p;
      return p;
    },
    [pinned, pinnedAfter, duration],
  );

  const onToggle = useCallback(() => {
    if (pinned) return;
    if (!interacted) setInteracted(true);
    setTarget(!afterRef.current);
  }, [pinned, interacted, setTarget]);

  return {
    progressAt,
    after: pinned ? pinnedAfter : after,
    disabled: pinned,
    interacted,
    onToggle,
  };
}
