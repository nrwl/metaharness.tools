/**
 * MultiRepoCubes draw kernel (pure, no React).
 *
 * "Your scope grows from one repo to several." The scene opens on a single
 * 'frontend' repository cube with an AI agent glowing inside, exactly the
 * SingleRepoCube treatment. The cube then glides left and shrinks into its
 * slot while 'design-system' and 'backend' cubes scale and fade in, staggered,
 * each with its own agent glow. The three cubes are intentionally not
 * connected in any way: three boxes, three agents, no links. The scene holds
 * with slow per-cube rotation and breathing glows, fades out, and loops.
 *
 * Continuous motion (rotation, glow breathing) runs off `elapsed`. The reveal
 * timeline can be clamped separately so page sections can hold the settled
 * layout without freezing cube rotation.
 */
import {
  clamp01,
  easeInOut,
  smoothstep,
  type KernelFrame,
} from '../../lib/anim';
import { drawCube } from '../../lib/cube';
import { DARK_PALETTE } from '../../lib/palette';

/** Loop length in seconds. */
export const MULTI_REPO_CUBES_CYCLE = 12;

/** Resolved cube colors for one theme (matches SingleRepoCube). */
interface CubeColors {
  accent: string;
  accentRgb: string;
  cubeStroke: string;
  cubeFace: string;
  textLabel: string;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout (640x420 logical)
// ---------------------------------------------------------------------------
const BASE_W = 640;
const BASE_H = 420;

// Single-cube opening pose.
const START_CX = 320;
const START_CY = 190;
const START_SIZE = 150;

// Final loose-triangle layout (no overlap, no links).
const FRONTEND = { cx: 122, cy: 165, size: 120, label: 'frontend' };
const DESIGN = { cx: 320, cy: 262, size: 120, label: 'design-system' };
const BACKEND = { cx: 518, cy: 165, size: 120, label: 'backend' };

// Timeline within the cycle (seconds).
const TRAVEL_START = 2.0;
const TRAVEL_END = 3.6;
const DESIGN_IN = 2.4;
const BACKEND_IN = 2.8;
const GROW_DUR = 1.2;
const FADE_OUT_START = 10.4;
const FADE_OUT_END = 11.7;
const FADE_IN_END = 0.5;

/** Settled full-scene frame, before the loop fade-out starts. */
export const MULTI_REPO_CUBES_HOLD_AT = FADE_OUT_START;

interface RepoCubeState {
  cx: number;
  cy: number;
  size: number;
  /** Y-axis rotation in radians (driven by global elapsed). */
  angle: number;
  /** Per-cube alpha, before the scene-wide fade. */
  alpha: number;
  /** Breathing phase offset so glows are not in lockstep. */
  pulsePhase: number;
  label: string;
}

/** One repo cube: wireframe box, agent glow + core + 'AI agent' label, repo label. */
function drawRepoCube(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  state: RepoCubeState,
  colors: CubeColors,
) {
  const { cx, cy, size, angle, alpha, pulsePhase, label } = state;
  if (alpha <= 0.001) return;

  // Scale glow/dot geometry with the cube so the look matches SingleRepoCube
  // (size 150) at every size.
  const s = size / 150;

  drawCube(ctx, {
    cx,
    cy,
    size,
    angle,
    tiltX: 0.25,
    stroke: colors.cubeStroke,
    edgeAlpha: 0.6,
    faceFill: colors.cubeFace,
    faceFillAlpha: 0.05,
    alpha,
  });

  // AI agent inside: breathing radial glow + solid accent core.
  const pulse = 0.8 + 0.2 * Math.sin(elapsed * 1.4 + pulsePhase);
  const glowR = 30 * pulse * s;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  glow.addColorStop(0, `rgba(${colors.accentRgb}, 0.5)`);
  glow.addColorStop(1, `rgba(${colors.accentRgb}, 0)`);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Labels: 'AI agent' under the glow, mono repo label below the cube.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = colors.accent;
  ctx.fillText('AI agent', cx, cy + 22 * s);

  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = colors.textLabel;
  ctx.fillText(label, cx, cy + size);

  ctx.globalAlpha = 1;
}

export function drawMultiRepoCubes(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    elapsed,
    appear,
    palette = DARK_PALETTE,
    timelineElapsed = elapsed,
  }: KernelFrame & { timelineElapsed?: number },
) {
  // Resolve theme tokens to the local cube palette (matches SingleRepoCube).
  const colors: CubeColors = {
    accent: palette.accent,
    accentRgb: palette.accentRgb,
    cubeStroke: palette.textDim,
    cubeFace: palette.textLabel,
    textLabel: palette.textLabel,
  };

  const t = timelineElapsed % MULTI_REPO_CUBES_CYCLE;

  // Scene-wide fade: ramp in at the top of each cycle, ramp out at the end.
  const fadeIn = smoothstep(0, FADE_IN_END, t);
  const fadeOut = 1 - smoothstep(FADE_OUT_START, FADE_OUT_END, t);
  const scene = appear * Math.min(fadeIn, fadeOut);
  if (scene <= 0.001) return;

  const fit = Math.min(width / BASE_W, height / BASE_H);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(fit, fit);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  // Frontend cube: centered opening pose, eased travel into its final slot.
  const travel = easeInOut(
    clamp01((t - TRAVEL_START) / (TRAVEL_END - TRAVEL_START)),
  );
  drawRepoCube(ctx, elapsed, {
    cx: START_CX + (FRONTEND.cx - START_CX) * travel,
    cy: START_CY + (FRONTEND.cy - START_CY) * travel,
    size: START_SIZE + (FRONTEND.size - START_SIZE) * travel,
    angle: elapsed * 0.25,
    alpha: scene,
    pulsePhase: 0,
    label: FRONTEND.label,
  }, colors);

  // The two new cubes scale and fade in, staggered. Their glows and labels
  // ride the same alpha. Slightly different rotation speeds and phases keep
  // the hold feeling alive.
  const designIn = easeInOut(clamp01((t - DESIGN_IN) / GROW_DUR));
  drawRepoCube(ctx, elapsed, {
    cx: DESIGN.cx,
    cy: DESIGN.cy,
    size: DESIGN.size * (0.7 + 0.3 * designIn),
    angle: elapsed * 0.21 + 1.3,
    alpha: scene * designIn,
    pulsePhase: 2.1,
    label: DESIGN.label,
  }, colors);

  const backendIn = easeInOut(clamp01((t - BACKEND_IN) / GROW_DUR));
  drawRepoCube(ctx, elapsed, {
    cx: BACKEND.cx,
    cy: BACKEND.cy,
    size: BACKEND.size * (0.7 + 0.3 * backendIn),
    angle: elapsed * 0.29 + 2.6,
    alpha: scene * backendIn,
    pulsePhase: 4.4,
    label: BACKEND.label,
  }, colors);

  ctx.restore();
  ctx.globalAlpha = 1;
}
