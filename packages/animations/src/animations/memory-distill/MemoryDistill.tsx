import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { usePalette, useThemeMode } from '../../lib/theme';
import { drawMemoryDistill } from './kernel';

/**
 * MemoryDistill
 *
 * Sessions distilled into "memory": agent sessions orbit a soft, glowing blurb
 * with no well-defined boundary, each building a context graph and then pouring
 * that context inward as it finishes. The blurb pulses and swells with every
 * session it absorbs, and the absorbed context settles as faint drifting motes
 * — memory visibly accreting from the sessions that fed it. Thin React wrapper
 * around the pure {@link drawMemoryDistill} kernel.
 */
export interface MemoryDistillProps {
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

export function MemoryDistill({
  className,
  paused = false,
  width = 960,
  height = 600,
  style,
}: MemoryDistillProps) {
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
      drawMemoryDistill(ctx, {
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
