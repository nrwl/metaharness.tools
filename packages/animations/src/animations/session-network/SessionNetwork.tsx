import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawSessionNetwork } from './kernel';

/**
 * Sessions as first-class objects: each session builds a context graph at a
 * focal spot, attaches to the repos it touched, then docks into a persistent
 * memory band instead of evaporating. Thin React wrapper around the pure
 * {@link drawSessionNetwork} kernel (also rendered by MetaHarnessLayers'
 * expanded mode).
 */
export interface SessionNetworkProps {
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

const BG = '#0a0a0a';

export function SessionNetwork({
  className,
  paused = false,
  width = 960,
  height = 600,
  style,
}: SessionNetworkProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      drawSessionNetwork(ctx, { width: w, height: h, elapsed, appear: 1 });
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
