/**
 * SingleRepoCube draw kernel (pure, no React).
 *
 * A calm, continuously running visual: one repository rendered as a slowly
 * rotating transparent wireframe cube, with an AI agent glowing inside it.
 * The agent is a breathing radial accent glow with a solid core dot, labeled
 * 'AI agent'; the repo name sits below the cube. No cycle phases, just a soft
 * one-time build-in and steady rotation.
 *
 * Restyled from monorepo.tools' isolated-agents cubes for the
 * metaharness.tools site palette.
 */
import { smoothstep, type KernelFrame } from '../../lib/anim';
import { drawCube } from '../../lib/cube';

/**
 * Nominal loop length in seconds. The visual runs continuously with no scene
 * fade; exported for consistency with the other kernels.
 */
export const SINGLE_REPO_CUBE_CYCLE = 8;

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
const CUBE_STROKE = '#737373';
const CUBE_FACE = '#a3a3a3';
const TEXT_LABEL = '#a3a3a3';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout (480x360 logical): cube centered in the upper area, label below.
// ---------------------------------------------------------------------------
const BASE_W = 480;
const BASE_H = 360;

const CUBE_CX = 240;
const CUBE_CY = 168;
const CUBE_SIZE = 150;
const LABEL_Y = 320;

export function drawSingleRepoCube(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear }: KernelFrame,
) {
  // One-time build-in over the first ~0.6s.
  const A = appear * smoothstep(0, 0.6, elapsed);
  if (A <= 0.001) return;

  const fit = Math.min(width / BASE_W, height / BASE_H);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(fit, fit);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  // Repository cube: slow spin, low-alpha faces, wireframe edges.
  drawCube(ctx, {
    cx: CUBE_CX,
    cy: CUBE_CY,
    size: CUBE_SIZE,
    angle: elapsed * 0.25,
    tiltX: 0.25,
    stroke: CUBE_STROKE,
    edgeAlpha: 0.6,
    faceFill: CUBE_FACE,
    faceFillAlpha: 0.05,
    alpha: A,
  });

  // AI agent inside: breathing radial glow + solid accent core.
  const pulse = 0.8 + 0.2 * Math.sin(elapsed * 1.4);
  const glowR = 30 * pulse;
  const glow = ctx.createRadialGradient(
    CUBE_CX,
    CUBE_CY,
    0,
    CUBE_CX,
    CUBE_CY,
    glowR,
  );
  glow.addColorStop(0, `rgba(${ACCENT_RGB}, 0.5)`);
  glow.addColorStop(1, `rgba(${ACCENT_RGB}, 0)`);
  ctx.globalAlpha = A;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(CUBE_CX, CUBE_CY, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(CUBE_CX, CUBE_CY, 5, 0, Math.PI * 2);
  ctx.fill();

  // Labels.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('AI agent', CUBE_CX, CUBE_CY + 22);

  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = TEXT_LABEL;
  ctx.fillText('frontend', CUBE_CX, LABEL_Y);

  ctx.restore();
  ctx.globalAlpha = 1;
}
