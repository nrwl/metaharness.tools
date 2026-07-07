import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawSessionTimeline } from './kernel';

/**
 * Multiplayer / collaboration: sessions pop in over a faint repo backdrop,
 * reorganize into a date-column timeline linked by a web of reference edges,
 * then one session is selected with gold edges and a detail card. Thin React
 * wrapper around the pure {@link drawSessionTimeline} kernel.
 */
export interface SessionTimelineProps {
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

export function SessionTimeline({
  className,
  paused = false,
  width = 960,
  height = 600,
  style,
}: SessionTimelineProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      drawSessionTimeline(ctx, { width: w, height: h, elapsed, appear: 1 });
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
