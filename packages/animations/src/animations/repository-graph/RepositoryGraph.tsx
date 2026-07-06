import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawRepositoryGraph } from './kernel';

/**
 * A force-directed cloud of repositories (accent hubs + gray OSS deps) with a
 * deterministic d3-force layout, center-out reveal and a camera zoom-out.
 * Thin React wrapper around the pure {@link drawRepositoryGraph} kernel (also
 * rendered by MetaHarnessLayers' expanded mode).
 */
export interface RepositoryGraphProps {
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

export function RepositoryGraph({
  className,
  paused = false,
  width = 960,
  height = 600,
  style,
}: RepositoryGraphProps) {
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
      drawRepositoryGraph(ctx, { width: w, height: h, elapsed, appear: 1 });
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
