import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawMultiRepoCubes, MULTI_REPO_CUBES_HOLD_AT } from './kernel';

/**
 * MultiRepoCubes
 *
 * Your scope grows from one repo to several: a single 'frontend' cube with an
 * AI agent inside glides aside as 'design-system' and 'backend' cubes appear,
 * each with its own agent. No connections between them. Thin React wrapper
 * around the pure {@link drawMultiRepoCubes} kernel.
 */
export interface MultiRepoCubesProps {
  /** Forwarded to the wrapper element. */
  className?: string;
  /** Freeze on a single static frame. */
  paused?: boolean;
  /** Run the reveal once, then keep the settled cubes idling. */
  playOnce?: boolean;
  /** Logical drawing width in CSS pixels. */
  width?: number;
  /** Logical drawing height in CSS pixels. */
  height?: number;
  style?: CSSProperties;
}

export function MultiRepoCubes({
  className,
  paused = false,
  playOnce = false,
  width = 640,
  height = 420,
  style,
}: MultiRepoCubesProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      drawMultiRepoCubes(ctx, {
        width: w,
        height: h,
        elapsed,
        appear: 1,
        timelineElapsed: playOnce
          ? Math.min(elapsed, MULTI_REPO_CUBES_HOLD_AT)
          : elapsed,
      });
    },
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', maxWidth: width, ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
        }}
      />
    </div>
  );
}
