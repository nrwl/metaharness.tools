import { type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';

/**
 * Copy this directory to start a new animation.
 *
 * It is intentionally trivial: it exists only to prove the pipeline
 * (shared canvas utilities -> component -> Storybook story) end to end.
 * It draws a single accent dot plus a label using {@link useCanvasAnimation}
 * and {@link useInView}. Real animation logic goes in your copy, not here.
 */
export interface TemplateProps {
  /** Forwarded to the wrapper element. */
  className?: string;
  /** Freeze on a single static frame. */
  paused?: boolean;
  style?: CSSProperties;
}

// Logical (CSS-pixel) drawing size. The canvas scales to its container width.
const WIDTH = 480;
const HEIGHT = 300;

const ACCENT = '#d4b483'; // desaturated amber, ~oklch(0.8 0.08 75)
const NEUTRAL = '#a3a3a3'; // neutral-400

export function Template({ className, paused = false, style }: TemplateProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  const canvasRef = useCanvasAnimation({
    width: WIDTH,
    height: HEIGHT,
    paused,
    active: inView,
    draw: ({ ctx, width, height, elapsed }) => {
      ctx.clearRect(0, 0, width, height);

      // Single accent dot with a subtle breathing opacity, just enough to
      // demonstrate the elapsed-time callback is driving frames.
      const breathe = 0.6 + 0.4 * Math.sin(elapsed * 1.5);
      ctx.beginPath();
      ctx.arc(width / 2, height / 2 - 12, 10, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = breathe;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label.
      ctx.font = '500 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = NEUTRAL;
      ctx.fillText('template', width / 2, height / 2 + 24);
    },
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', maxWidth: WIDTH, ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  );
}
