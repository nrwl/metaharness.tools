import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { usePalette, useThemeMode } from '../../lib/theme';
import { drawIsolatedSessions } from './kernel';

/**
 * IsolatedSessions
 *
 * Several teammates each run agent sessions, but every session stays local to
 * that person's machine: bubbles tethered to a laptop glyph connect down to
 * the shared repos yet never to each other, and each one deflates into a
 * small inert dot parked beside its owner's laptop, invisible to everyone
 * else. Thin React wrapper around the pure {@link drawIsolatedSessions}
 * kernel.
 */
export interface IsolatedSessionsProps {
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

export function IsolatedSessions({
  className,
  paused = false,
  width = 960,
  height = 600,
  style,
}: IsolatedSessionsProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const palette = usePalette();
  const mode = useThemeMode();

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    // Repaint frozen/paused frames the moment the theme flips.
    redrawKey: mode,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      drawIsolatedSessions(ctx, {
        width: w,
        height: h,
        elapsed,
        appear: 1,
        palette,
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
