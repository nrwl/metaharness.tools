import { type CSSProperties } from 'react';
import {
  useCanvasAnimation,
  useInView,
  useMorphToggle,
  type MorphMode,
} from '../../lib/canvas';
import { MorphSwitch } from '../../lib/MorphSwitch';
import { drawSessionMemory } from './kernel';

/**
 * SessionMemory
 *
 * A before/after morph contrasting sessions that are forgotten with sessions
 * captured into a persistent memory graph. Toggling the switch tweens a single
 * `progress` value: at 0 each session builds a context graph then dissolves and
 * vanishes (amnesia); at 1 the identical build phase ends in the session
 * shrinking and docking into a persistent memory band with dashed reference
 * links and connectors to the repos it touched. Thin React wrapper around the
 * pure {@link drawSessionMemory} kernel.
 */
export interface SessionMemoryProps {
  /** Forwarded to the wrapper element. */
  className?: string;
  /**
   * 'auto' (default) shows an interactive, auto-cycling switch; 'before' /
   * 'after' pin the morph to one end for stories and fixed site placements.
   */
  mode?: MorphMode;
  /** Freeze on a single static frame. */
  paused?: boolean;
  /** Logical drawing width in CSS pixels. */
  width?: number;
  /** Logical drawing height in CSS pixels. */
  height?: number;
  style?: CSSProperties;
}

const BG = '#0a0a0a';

export function SessionMemory({
  className,
  mode = 'auto',
  paused = false,
  width = 960,
  height = 600,
  style,
}: SessionMemoryProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const morph = useMorphToggle({ mode, inView });

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      const progress = morph.progressAt(elapsed);
      drawSessionMemory(ctx, {
        width: w,
        height: h,
        elapsed,
        appear: 1,
        progress,
      });
    },
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', maxWidth: width, ...style }}
    >
      <MorphSwitch
        after={morph.after}
        disabled={morph.disabled}
        onToggle={morph.onToggle}
        offLabel="without meta-harness"
        onLabel="with meta-harness"
      />
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  );
}
