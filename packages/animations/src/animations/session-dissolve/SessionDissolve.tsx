import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawSessionDissolve } from './kernel';

/**
 * SessionDissolve
 *
 * Single-player session amnesia: one person's session pops up above a row of
 * repos, builds a context graph, connects to the repo it touched, then the
 * context implodes and the session fades away. A second session by the same
 * person repeats the ritual against another repo and dissolves too. No memory,
 * no docking; every session starts from scratch. Thin React wrapper around the
 * pure {@link drawSessionDissolve} kernel.
 */
export interface SessionDissolveProps {
  /** Forwarded to the wrapper element. */
  className?: string;
  /** Freeze on a single static frame. */
  paused?: boolean;
  /** Logical drawing width in CSS pixels. */
  width?: number;
  /** Logical drawing height in CSS pixels. */
  height?: number;
  style?: CSSProperties;
}

export function SessionDissolve({
  className,
  paused = false,
  width = 960,
  height = 600,
  style,
}: SessionDissolveProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      drawSessionDissolve(ctx, { width: w, height: h, elapsed, appear: 1 });
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
