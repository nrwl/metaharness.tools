import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawSingleRepoCube } from './kernel';

/**
 * SingleRepoCube
 *
 * A calm, continuously running visual: one repository cube slowly rotating
 * with an AI agent glowing inside it. Thin React wrapper around the pure
 * {@link drawSingleRepoCube} kernel.
 */
export interface SingleRepoCubeProps {
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

export function SingleRepoCube({
  className,
  paused = false,
  width = 480,
  height = 360,
  style,
}: SingleRepoCubeProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      drawSingleRepoCube(ctx, { width: w, height: h, elapsed, appear: 1 });
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
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  );
}
