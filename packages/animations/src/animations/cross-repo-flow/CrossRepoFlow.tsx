import { type CSSProperties } from 'react';
import {
  useCanvasAnimation,
  useInView,
  useMorphToggle,
  type MorphMode,
} from '../../lib/canvas';
import { MorphSwitch } from '../../lib/MorphSwitch';
import { drawCrossRepoFlow } from './kernel';

/**
 * CrossRepoFlow
 *
 * A before/after morph contrasting manual cross-repo plumbing with
 * meta-harness coordination. Five repositories sit in a hub topology; toggling
 * the switch tweens a single `progress` value that morphs opaque, isolated
 * repo "cages" (each with a trapped agent and manual chores) into a
 * transparent, connected synthetic graph where agents see across boundaries
 * and one agent roams the whole org. Thin React wrapper around the pure
 * {@link drawCrossRepoFlow} kernel.
 */
export interface CrossRepoFlowProps {
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

export function CrossRepoFlow({
  className,
  mode = 'auto',
  paused = false,
  width = 960,
  height = 600,
  style,
}: CrossRepoFlowProps) {
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
      drawCrossRepoFlow(ctx, {
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
