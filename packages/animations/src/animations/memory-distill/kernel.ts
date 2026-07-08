/**
 * MemoryDistill draw kernel (pure, no React).
 *
 * What "memory" looks like: sessions are distilled into it. A soft, glowing
 * blurb with no well-defined boundary sits at the center of the scene — this is
 * the accumulated memory. Around it, agent sessions pop up in an orbit, each
 * building a small context graph inside a glowing circle (the familiar session
 * bubble from the other session animations). When a session finishes, it does
 * NOT dissolve into nothing or dock as a discrete card: instead its context is
 * distilled — the graph nodes detach and stream inward, pouring into the memory
 * blurb, which pulses brighter and swells a little with every session it
 * absorbs. Absorbed context settles as faint drifting motes inside the blurb,
 * so the memory visibly gains substance over the cycle. Then the whole scene
 * fades and loops, the blurb starting small again.
 *
 * The memory blurb is deliberately boundary-less: layered radial-gradient glows
 * plus a couple of wobbling, gradient-filled contours (no stroke), so its edge
 * is always soft and shifting rather than a crisp circle.
 *
 * Adapted from the isolated-sessions / session-dissolve kernels (repo-less):
 * the session bubble + context-graph build is reused, but the dissolve/park
 * ending is replaced by the distill-into-memory stream. Continuous cycling
 * reads `elapsed`; there is no morph. Palette is resolved per frame so the
 * scene re-themes with the site toggle.
 */
import {
  clamp01,
  drift,
  easeInOut,
  lerp,
  mulberry32,
  smoothstep,
  type KernelFrame,
  type Pt,
} from '../../lib/anim';
import { DARK_PALETTE, type VizPalette } from '../../lib/palette';

/** Seconds per loop. */
export const MEMORY_DISTILL_CYCLE = 17;

// ---------------------------------------------------------------------------
// Palette. Resolved per frame from the theme palette so the scene re-themes
// when the site toggle flips. See ../../lib/palette.
// ---------------------------------------------------------------------------
interface Colors {
  accent: string;
  accentRgb: string;
  nodeTint: string;
  nodeTintRgb: string;
  fill: string;
  textLabel: string;
  textHeader: string;
}

function resolveColors(palette: VizPalette): Colors {
  return {
    accent: palette.accent,
    accentRgb: palette.accentRgb,
    nodeTint: palette.accentSoft,
    nodeTintRgb: palette.nodeTintRgb,
    fill: palette.surface,
    textLabel: palette.textLabel,
    textHeader: palette.textHeader,
  };
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout (960x600 logical). The memory blurb lives at the center; sessions
// orbit it and are distilled inward one after another.
// ---------------------------------------------------------------------------
const BASE_W = 960;
const BASE_H = 600;

const CENTER: Pt = { x: 480, y: 300 };

/** Session bubble radius before it starts distilling. */
const SESSION_R = 54;
/** Orbit radius of the session bubbles around the memory blurb. */
const ORBIT_R = 218;

/** Memory blurb radius when empty vs. fully charged. */
const BLOB_MIN_R = 40;
const BLOB_MAX_R = 132;

interface SessionDef {
  name: string;
  letter: string;
  /** Cycle time (seconds) at which this session pops in. */
  start: number;
  /** Orbit angle in radians (0 = right, clockwise in screen space). */
  angle: number;
}

// Five sessions evenly spaced around the orbit, one popping in at a time so the
// blurb absorbs them in sequence. The top slot leads; the rest follow clockwise.
const SESSIONS: SessionDef[] = [
  { name: 'Juri', letter: 'J', start: 1.2, angle: -Math.PI / 2 },
  {
    name: 'Victor',
    letter: 'V',
    start: 3.6,
    angle: -Math.PI / 2 + (2 * Math.PI) / 5,
  },
  {
    name: 'James',
    letter: 'J',
    start: 6.0,
    angle: -Math.PI / 2 + (4 * Math.PI) / 5,
  },
  {
    name: 'Max',
    letter: 'M',
    start: 8.4,
    angle: -Math.PI / 2 + (6 * Math.PI) / 5,
  },
  {
    name: 'Nadia',
    letter: 'N',
    start: 10.8,
    angle: -Math.PI / 2 + (8 * Math.PI) / 5,
  },
];

// Inner context graph: 7 nodes seeded-random in a unit disc, fixed edges.
const CTX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [0, 3],
  [3, 4],
  [2, 5],
  [4, 6],
  [5, 6],
  [1, 5],
];

const CTX_GRAPHS: Pt[][] = SESSIONS.map((_, i) => {
  const rnd = mulberry32(0x3c7 + i * 1013);
  return Array.from({ length: 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.18 + rnd() * 0.62;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.86 };
  });
});

/** Settled positions (unit disc) for the motes each session leaves behind. */
const MOTES_PER_SESSION = 4;
const MOTE_SEEDS: Pt[][] = SESSIONS.map((_, i) => {
  const rnd = mulberry32(0x7a1 + i * 617);
  return Array.from({ length: MOTES_PER_SESSION }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.12 + rnd() * 0.66;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.9 };
  });
});

// ---------------------------------------------------------------------------
// Timeline. The blurb seeds early and grows as sessions pour in; the whole
// scene fades and loops at the end.
// ---------------------------------------------------------------------------
const FADE = [15.4, 17] as const;

interface SessionState {
  u: number;
  pop: number;
  build: number;
  /** 0 = intact bubble, 1 = fully distilled into the blurb. */
  distill: number;
  /** Bubble husk / badge visibility (fades as it distills). */
  fade: number;
  /** How much of this session's context now lives in memory (0..1). */
  poured: number;
  x: number;
  y: number;
  scale: number;
  r: number;
}

function sessionState(i: number, t: number, elapsed: number): SessionState {
  const u = t - SESSIONS[i].start;
  const pop = smoothstep(0, 0.35, u);
  const build = smoothstep(0.3, 1.5, u);
  const distill = smoothstep(1.7, 2.9, u);
  const fade = 1 - smoothstep(1.8, 2.6, u);
  const poured = smoothstep(1.7, 3.0, u);

  const def = SESSIONS[i];
  const d = drift(0.27 + i * 0.17, elapsed, 2.2);
  const scale = lerp(0.82, 1, easeInOut(pop));
  return {
    u,
    pop,
    build,
    distill,
    fade,
    poured,
    x: CENTER.x + Math.cos(def.angle) * ORBIT_R + d.x,
    y: CENTER.y + Math.sin(def.angle) * ORBIT_R + d.y,
    scale,
    r: SESSION_R * scale,
  };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawMemoryDistill(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear, palette = DARK_PALETTE }: KernelFrame,
) {
  const c = resolveColors(palette);
  const t = elapsed % MEMORY_DISTILL_CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;

  const fit = Math.min(width / BASE_W, height / BASE_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  const states = SESSIONS.map((_, i) => sessionState(i, t, elapsed));

  // Charge = mean of how much each session has poured in; drives blurb size.
  let charge = 0;
  for (const st of states) charge += st.poured;
  charge = clamp01(charge / SESSIONS.length);

  // Flash: brief brighten each time a session's stream arrives (~distill 0.85).
  let flash = 0;
  for (const st of states) {
    if (st.pop <= 0.01) continue;
    const d = Math.abs(st.distill - 0.85);
    if (d < 0.22) flash = Math.max(flash, (1 - d / 0.22) * st.pop);
  }

  const blobR = lerp(BLOB_MIN_R, BLOB_MAX_R, easeInOut(charge));

  drawStreams(ctx, states, blobR, elapsed, A, c);
  drawMemoryBlob(ctx, blobR, elapsed, flash, charge, A, c);
  drawMotes(ctx, states, blobR, elapsed, A, c);
  for (let i = 0; i < SESSIONS.length; i++) {
    drawSession(ctx, i, states[i], A, c);
  }
  drawCaption(ctx, blobR, flash, A, c);

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Memory blurb (boundary-less glow) --------------------------------------
/** A wobbling, closed contour — organic radius so the edge never reads crisp. */
function blobPath(
  ctx: CanvasRenderingContext2D,
  r: number,
  elapsed: number,
  phase: number,
) {
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wob =
      1 +
      0.13 * Math.sin(3 * a + elapsed * 0.7 + phase) +
      0.07 * Math.sin(5 * a - elapsed * 0.5 + phase * 1.3) +
      0.05 * Math.sin(2 * a + elapsed * 1.1 + phase * 0.6);
    const rr = r * wob;
    const x = CENTER.x + Math.cos(a) * rr;
    const y = CENTER.y + Math.sin(a) * rr * 0.92;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawMemoryBlob(
  ctx: CanvasRenderingContext2D,
  blobR: number,
  elapsed: number,
  flash: number,
  charge: number,
  A: number,
  c: Colors,
) {
  const { x, y } = CENTER;
  const breathe = 1 + 0.045 * Math.sin(elapsed * 1.3);
  const R = blobR * breathe;
  const rgb = c.accentRgb;
  const tintRgb = c.nodeTintRgb;

  ctx.save();

  // Diffuse outer nebula: layered radial gradients fading to nothing. No edge.
  const glow: ReadonlyArray<readonly [number, number]> = [
    [2.7, 0.05],
    [1.9, 0.07],
    [1.3, 0.1],
  ];
  for (const [mult, a] of glow) {
    const rr = R * mult;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    const a0 = (a + flash * 0.05) * (0.5 + 0.5 * charge);
    g.addColorStop(0, `rgba(${rgb}, ${a0})`);
    g.addColorStop(0.55, `rgba(${rgb}, ${a0 * 0.45})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.globalAlpha = A;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Two wobbling gradient-filled bodies at different phases: a soft, shifting
  // mass. Gradient-to-transparent fill keeps the boundary undefined.
  const bodies: ReadonlyArray<readonly [number, number, number]> = [
    [1.14, 0.0, 0.16],
    [0.94, 2.3, 0.13],
  ];
  for (const [mult, phase, a] of bodies) {
    const rr = R * mult;
    const g = ctx.createRadialGradient(x, y, rr * 0.15, x, y, rr);
    g.addColorStop(0, `rgba(${tintRgb}, ${a + flash * 0.16})`);
    g.addColorStop(0.6, `rgba(${rgb}, ${a * 0.7 + flash * 0.08})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.globalAlpha = A;
    ctx.fillStyle = g;
    ctx.beginPath();
    blobPath(ctx, rr, elapsed, phase);
    ctx.fill();
  }

  // Hot core: small, brightest at center, still soft-edged.
  const coreR = R * 0.5;
  const core = ctx.createRadialGradient(x, y, 0, x, y, coreR);
  core.addColorStop(0, `rgba(${tintRgb}, ${0.32 + flash * 0.3})`);
  core.addColorStop(1, `rgba(${tintRgb}, 0)`);
  ctx.globalAlpha = A;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ---- Settled motes: absorbed context drifting inside the blurb --------------
function drawMotes(
  ctx: CanvasRenderingContext2D,
  states: SessionState[],
  blobR: number,
  elapsed: number,
  A: number,
  c: Colors,
) {
  ctx.save();
  for (let i = 0; i < SESSIONS.length; i++) {
    const st = states[i];
    // A mote appears only once its session has finished pouring in.
    const reveal = smoothstep(0.7, 1, st.distill) * st.pop;
    if (reveal <= 0.01) continue;
    MOTE_SEEDS[i].forEach((m, j) => {
      const dd = drift(0.5 + i * 0.3 + j * 0.11, elapsed, 3.2);
      const mx = CENTER.x + m.x * blobR * 0.82 + dd.x;
      const my = CENTER.y + m.y * blobR * 0.82 + dd.y;
      const tw = 0.55 + 0.45 * Math.sin(elapsed * 1.6 + i * 2 + j);
      ctx.globalAlpha = A * reveal * tw * 0.7;
      ctx.fillStyle = c.nodeTint;
      ctx.beginPath();
      ctx.arc(mx, my, 1.9, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

// ---- Distill streams: context flowing from a session into the blurb ---------
function drawStreams(
  ctx: CanvasRenderingContext2D,
  states: SessionState[],
  blobR: number,
  elapsed: number,
  A: number,
  c: Colors,
) {
  ctx.save();
  for (let i = 0; i < SESSIONS.length; i++) {
    const st = states[i];
    if (st.distill <= 0.001 || st.distill >= 0.999) continue;
    if (st.pop <= 0.01) continue;

    const ang = Math.atan2(CENTER.y - st.y, CENTER.x - st.x);
    const ax = st.x + Math.cos(ang) * st.r;
    const ay = st.y + Math.sin(ang) * st.r;
    const bx = CENTER.x - Math.cos(ang) * blobR * 0.7;
    const by = CENTER.y - Math.sin(ang) * blobR * 0.7;

    // Faint guide line along the pour path.
    ctx.globalAlpha = A * 0.18 * st.fade;
    ctx.strokeStyle = `rgba(${c.accentRgb}, 0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Traveling motes: a few packets streaming from the bubble to the blurb.
    const PACKETS = 4;
    for (let k = 0; k < PACKETS; k++) {
      const phase = (st.distill * 1.6 + k / PACKETS + elapsed * 0.15) % 1;
      const e = easeInOut(phase);
      const px = lerp(ax, bx, e);
      const py = lerp(ay, by, e);
      const near = 1 - smoothstep(0.75, 1, phase);
      ctx.globalAlpha = A * near * (0.85 * st.distill);
      ctx.fillStyle = c.nodeTint;
      ctx.beginPath();
      ctx.arc(px, py, lerp(2.6, 1.2, phase), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- Session bubble (halo + context graph + badge + name) -------------------
function drawSession(
  ctx: CanvasRenderingContext2D,
  i: number,
  st: SessionState,
  A: number,
  c: Colors,
) {
  if (st.pop <= 0.001) return;
  const def = SESSIONS[i];
  const alpha = st.pop * st.fade * A;
  if (alpha <= 0.001) return;

  ctx.save();

  // Halo: low-alpha accent glow that thins out as the session distills away.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgba(${c.accentRgb}, 0.07)`;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${c.accentRgb}, 0.05)`;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${c.accentRgb}, 0.16)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.stroke();

  // Context graph inside the halo: builds edge by edge, then each node detaches
  // and streams toward the memory blurb (staggered so it reads as a pour).
  const nodeR = st.r * 0.78;
  const dir = Math.atan2(CENTER.y - st.y, CENTER.x - st.x);
  const pts = CTX_GRAPHS[i].map((pt, j) => {
    const bx = st.x + pt.x * nodeR;
    const by = st.y + pt.y * nodeR;
    // Per-node migration window, spread across the distill so nodes leave in a
    // stream rather than all at once.
    const mj = clamp01((st.distill - j * 0.05) / 0.7);
    const e = easeInOut(mj);
    return {
      x: lerp(bx, CENTER.x + Math.cos(dir) * 6, e),
      y: lerp(by, CENTER.y + Math.sin(dir) * 6, e),
      vis: 1 - smoothstep(0.7, 1, mj),
    };
  });
  const E = CTX_EDGES.length;
  CTX_EDGES.forEach(([a, b], k) => {
    const er = smoothstep(k / E, k / E + 0.25, st.build);
    const ev = Math.min(pts[a].vis, pts[b].vis) * (1 - st.distill);
    if (er <= 0.001 || ev <= 0.001) return;
    ctx.globalAlpha = st.pop * A * er * ev;
    ctx.strokeStyle = `rgba(${c.nodeTintRgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });
  pts.forEach((pt, j) => {
    const nr = smoothstep((j / 7) * 0.8, (j / 7) * 0.8 + 0.2, st.build);
    if (nr <= 0.001 || pt.vis <= 0.001) return;
    ctx.globalAlpha = st.pop * A * nr * pt.vis;
    ctx.fillStyle = c.nodeTint;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1.4, 3.6 * st.scale), 0, Math.PI * 2);
    ctx.fill();
  });

  // Initial-letter badge: fades during the distill.
  if (st.fade > 0.001) {
    const bx = st.x - st.r * 0.78;
    const by = st.y - st.r * 0.78;
    const br = Math.max(6, 8 * st.scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${c.accentRgb}, 0.55)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.textHeader;
    ctx.fillText(def.letter, bx, by + 0.5);

    // Session name, tucked on the outer side of the bubble.
    const outward = Math.atan2(st.y - CENTER.y, st.x - CENTER.x);
    ctx.globalAlpha = alpha;
    ctx.font = `12px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.textLabel;
    ctx.fillText(
      def.name,
      st.x + Math.cos(outward) * (st.r + 16),
      st.y + Math.sin(outward) * (st.r + 16),
    );
  }

  ctx.restore();
}

// ---- Caption ----------------------------------------------------------------
function drawCaption(
  ctx: CanvasRenderingContext2D,
  blobR: number,
  flash: number,
  A: number,
  c: Colors,
) {
  ctx.save();
  ctx.globalAlpha = A * (0.7 + flash * 0.3);
  ctx.font = `600 15px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.textLabel;
  ctx.fillText('memory', CENTER.x, CENTER.y + Math.max(blobR + 34, 120));
  ctx.restore();
}
