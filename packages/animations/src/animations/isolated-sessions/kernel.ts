/**
 * IsolatedSessions draw kernel (pure, no React).
 *
 * The "real work is multiplayer" problem: four teammates each run agent
 * sessions, but every session is an island local to that person's machine.
 * Each person has a persistent laptop glyph; session bubbles pop up above it,
 * tethered to it by a faint dashed line, build a context graph, briefly
 * connect down to one shared repo, then the context implodes and the bubble
 * deflates into a small inert dot that parks beside that person's laptop.
 * Later in the cycle some people start a second session and another dot joins
 * the row. Crucially there are NO session-to-session links of any kind and no
 * links between the parked dots: the repos below are shared, the sessions
 * never are, and each machine's dots stay invisible to everyone else until
 * the whole-scene fade wipes them for the loop.
 *
 * Adapted from the session-memory kernel's before-side (repo row, session
 * halo, context graph, implode), with the morph plumbing removed and the
 * forget-fade replaced by the deflate-and-park behavior.
 */
import {
  drift,
  easeInOut,
  lerp,
  mulberry32,
  roundRectPath,
  smoothstep,
  type KernelFrame,
  type Pt,
} from '../../lib/anim';
import { DARK_PALETTE, type VizPalette } from '../../lib/palette';

/** Seconds per loop. */
export const ISOLATED_SESSIONS_CYCLE = 14;

// ---------------------------------------------------------------------------
// Palette. Resolved per-frame from the theme palette on the frame, so the
// scene re-themes when the site toggle flips. See ../../lib/palette.
// ---------------------------------------------------------------------------
interface Colors {
  accent: string;
  accentRgb: string;
  nodeTint: string;
  nodeTintRgb: string;
  fill: string;
  line: string;
  textLabel: string;
  textHeader: string;
  /** Quiet fill for the inert parked dot. */
  dotFill: string;
}

function resolveColors(palette: VizPalette): Colors {
  return {
    accent: palette.accent,
    accentRgb: palette.accentRgb,
    nodeTint: palette.accentSoft,
    nodeTintRgb: palette.nodeTintRgb,
    fill: palette.surface,
    line: palette.line,
    textLabel: palette.textLabel,
    textHeader: palette.textHeader,
    dotFill: `rgba(${palette.accentRgb}, 0.35)`,
  };
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout (960x600 logical). People spread across the upper half, each with a
// laptop below their session spot; the shared repo row sits along the bottom.
// ---------------------------------------------------------------------------
// (Base 960x600 design size is implicit in the CONTENT box below.)
// Content bounding box within BASE (the four people + laptops across the top and
// the shared repo row along the bottom), used to fit-and-centre the drawing to
// the canvas so it fills the frame rather than floating small on narrow widths.
const FIT_CX = 483;
const FIT_CY = 340;
// Wide enough to include the session circles, which bulge past the outer
// laptops (Maya's reaches ~x=68, Elena's ~x=897), and tall enough to clear the
// circles above the people (~y=100) and the repo labels below (~y=580).
const FIT_W = 880;
const FIT_H = 500;

const SESSION_R = 62;

interface RepoDef {
  id: string;
  x: number;
  y: number;
}

const REPOS: RepoDef[] = [
  { id: 'frontend', x: 250, y: 490 },
  { id: 'design-system', x: 485, y: 550 },
  { id: 'backend', x: 725, y: 500 },
];

const REPO_EDGES = [
  { a: 0, b: 1, label: 'package' },
  { a: 0, b: 2, label: 'api' },
];

interface PersonDef {
  name: string;
  letter: string;
  /** Session bubble home position (upper half). */
  x: number;
  y: number;
  /** Index into REPOS this person's sessions touch. */
  repo: number;
}

const PEOPLE: PersonDef[] = [
  { name: 'Maya', letter: 'M', x: 130, y: 176, repo: 0 },
  { name: 'Leo', letter: 'L', x: 365, y: 162, repo: 2 },
  { name: 'Noah', letter: 'N', x: 600, y: 186, repo: 1 },
  { name: 'Elena', letter: 'E', x: 835, y: 170, repo: 0 },
];

/** Vertical offset from a person's home position to their laptop baseline. */
const LAPTOP_DY = 135;

/** Radius of a parked (fully deflated) session dot. */
const DOT_R = 4;
/** First dock spot: horizontal offset from the laptop center. */
const DOCK_DX = 30;
/** Each later run of the same person parks one step further right. */
const DOCK_STEP = 12;

/**
 * Session runs. Staggered active windows keep 2-3 bubbles visible at once;
 * after the first wave dissolves, a second session appears for some people to
 * show the cycle keeps happening. One run at a time per person.
 */
const RUNS: ReadonlyArray<{ person: number; start: number }> = [
  { person: 0, start: 1.0 },
  { person: 1, start: 2.1 },
  { person: 2, start: 3.1 },
  { person: 3, start: 4.2 },
  { person: 0, start: 7.4 },
  { person: 2, start: 8.5 },
  { person: 1, start: 9.5 },
];

/** Per-person run counter: the Nth run of a person parks at the Nth spot. */
const RUN_SEQ: number[] = (() => {
  const counts = new Map<number, number>();
  return RUNS.map((run) => {
    const seq = counts.get(run.person) ?? 0;
    counts.set(run.person, seq + 1);
    return seq;
  });
})();

// Inner context graph: 7 nodes seeded-random in a unit disc, fixed edges.
const CTX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [0, 3], [3, 4], [2, 5], [4, 6], [5, 6], [1, 5],
];

const CTX_GRAPHS: Pt[][] = RUNS.map((_, i) => {
  const rnd = mulberry32(0x51d + i * 977);
  return Array.from({ length: 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.18 + rnd() * 0.62;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.86 };
  });
});

// ---------------------------------------------------------------------------
// Timeline. Repos and laptops are always shown (pinned to scroll reveal); the
// session runs come and go, then the whole scene fades and loops.
// ---------------------------------------------------------------------------
const FADE = [12.4, 13.8] as const;

interface RunState {
  u: number;
  pop: number;
  build: number;
  conn: number;
  /** Context implosion amount (dissolve inward). */
  implode: number;
  /** Deflate-and-park amount: 0 = full bubble, 1 = docked dot. */
  dock: number;
  /** Visibility of the session's accoutrements (badge, tether, connector). */
  fade: number;
  x: number;
  y: number;
  scale: number;
  r: number;
}

function runState(i: number, t: number, elapsed: number): RunState {
  const u = t - RUNS[i].start;
  const pop = smoothstep(0, 0.35, u);
  const build = smoothstep(0.25, 1.4, u);
  const conn = smoothstep(0.95, 1.5, u);
  const implode = smoothstep(1.6, 2.2, u);
  const dock = smoothstep(1.9, 2.8, u);
  const fade = 1 - smoothstep(1.9, 2.4, u);

  const person = PEOPLE[RUNS[i].person];
  const d = drift(0.21 + i * 0.19, elapsed, 1.6);
  const scale = lerp(0.82, 1, easeInOut(pop));

  // Dock spot: a horizontal row beside the laptop, one step per earlier run.
  const restX = person.x + DOCK_DX + RUN_SEQ[i] * DOCK_STEP;
  const restY = person.y + LAPTOP_DY + 2;
  const de = easeInOut(dock);
  return {
    u,
    pop,
    build,
    conn,
    implode,
    dock,
    fade,
    x: lerp(person.x + d.x, restX, de),
    y: lerp(person.y + d.y, restY, de),
    scale,
    r: lerp(SESSION_R * scale, DOT_R, de),
  };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawIsolatedSessions(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear, palette = DARK_PALETTE }: KernelFrame,
) {
  const c = resolveColors(palette);
  const t = elapsed % ISOLATED_SESSIONS_CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  // Repos and laptops are pinned to `appear` (scroll reveal) so they stay put;
  // only the sessions (circles, tethers, repo connectors) ride `A`'s per-cycle
  // build/fade.
  const A = appear * cycleFade;
  if (appear <= 0.001) return;

  // Fit the actual content box (not the loose BASE canvas), centred on content.
  const fit = Math.min(width / FIT_W, height / FIT_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-FIT_CX, -FIT_CY);

  const states = RUNS.map((_, i) => runState(i, t, elapsed));

  drawRepoLayer(ctx, appear, c);
  drawLaptops(ctx, appear, c);
  drawTethers(ctx, states, A, c);
  drawRepoConnectors(ctx, states, A, c);
  for (let i = 0; i < RUNS.length; i++) {
    drawSession(ctx, i, states[i], A, c);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Shared repo row --------------------------------------------------------
function drawRepoLayer(
  ctx: CanvasRenderingContext2D,
  A: number, // persistent scroll-reveal (not the per-cycle fade): repos stay put
  c: Colors,
) {
  REPO_EDGES.forEach((edge) => {
    const a = REPOS[edge.a];
    const b = REPOS[edge.b];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const pad = 18;
    const ax = a.x + Math.cos(ang) * pad;
    const ay = a.y + Math.sin(ang) * pad;
    const bx = b.x - Math.cos(ang) * pad;
    const by = b.y - Math.sin(ang) * pad;
    ctx.save();
    ctx.globalAlpha = 0.9 * A;
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  });

  REPOS.forEach((repo) => {
    ctx.save();
    ctx.globalAlpha = A;
    ctx.fillStyle = `rgba(${c.accentRgb}, 0.12)`;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `13px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.textLabel;
    ctx.fillText(repo.id, repo.x, repo.y + 34);
    ctx.restore();
  });
}

// ---- Laptops (each person's local machine, persistent) ----------------------
function drawLaptops(
  ctx: CanvasRenderingContext2D,
  A: number, // persistent scroll-reveal: laptops stay put across cycles
  c: Colors,
) {
  PEOPLE.forEach((person) => {
    const s = 1;
    const x = person.x;
    const by = person.y + LAPTOP_DY; // screen baseline (hinge)

    ctx.save();
    ctx.globalAlpha = 0.9 * A;
    ctx.lineWidth = 1;

    // Screen: rounded rect above the hinge.
    const sw = 46 * s;
    const sh = 30 * s;
    roundRectPath(ctx, x - sw / 2, by - sh, sw, sh, 3 * s);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.stroke();

    // Base: slightly wider flat trapezoid under the screen.
    ctx.beginPath();
    ctx.moveTo(x - sw / 2 - 2 * s, by);
    ctx.lineTo(x + sw / 2 + 2 * s, by);
    ctx.lineTo(x + sw / 2 + 6 * s, by + 4 * s);
    ctx.lineTo(x - sw / 2 - 6 * s, by + 4 * s);
    ctx.closePath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.stroke();

    // Name under the machine.
    ctx.globalAlpha = A;
    ctx.font = `13px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.textLabel;
    ctx.fillText(person.name, x, by + 20);
    ctx.restore();
  });
}

// ---- Session -> laptop tethers ----------------------------------------------
function drawTethers(
  ctx: CanvasRenderingContext2D,
  states: RunState[],
  A: number,
  c: Colors,
) {
  RUNS.forEach((run, i) => {
    const st = states[i];
    const vis = st.pop * st.fade;
    if (vis <= 0.001) return;
    const person = PEOPLE[run.person];
    const topY = person.y + LAPTOP_DY - 26; // just above the laptop screen
    ctx.save();
    ctx.globalAlpha = 0.5 * vis * A;
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(st.x, st.y + st.r + 3);
    ctx.lineTo(person.x, topY);
    ctx.stroke();
    ctx.restore();
  });
}

// ---- Session -> repo connectors (each session touches ONE shared repo) ------
function drawRepoConnectors(
  ctx: CanvasRenderingContext2D,
  states: RunState[],
  A: number,
  c: Colors,
) {
  RUNS.forEach((run, i) => {
    const st = states[i];
    if (st.conn <= 0.001) return;
    const vis = st.conn * st.fade;
    if (vis <= 0.001) return;
    const repo = REPOS[PEOPLE[run.person].repo];
    const ang = Math.atan2(repo.y - st.y, repo.x - st.x);
    ctx.save();
    ctx.globalAlpha = vis * 0.45 * A;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(
      st.x + Math.cos(ang) * (st.r + 2),
      st.y + Math.sin(ang) * (st.r + 2),
    );
    ctx.lineTo(repo.x - Math.cos(ang) * 16, repo.y - Math.sin(ang) * 16);
    ctx.stroke();
    ctx.restore();
  });
}

// ---- Session bubble (halo + context graph + badge + parked dot) --------------
function drawSession(
  ctx: CanvasRenderingContext2D,
  i: number,
  st: RunState,
  A: number,
  c: Colors,
) {
  if (st.pop <= 0.001) return;
  const person = PEOPLE[RUNS[i].person];
  const alpha = st.pop * A;
  if (alpha <= 0.001) return;

  ctx.save();

  // Halo: low-alpha accent glow. It thins out as the bubble deflates; only
  // the shrinking husk travels to the dock spot.
  const husk = 1 - st.dock;
  if (husk > 0.001) {
    ctx.globalAlpha = alpha * husk;
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
  }

  // Parked dot: solidifies as the husk deflates, then persists for the rest
  // of the cycle. Quiet and inert: no glow, no label, no links to anything.
  if (st.dock > 0.001) {
    ctx.globalAlpha = alpha * st.dock;
    ctx.fillStyle = c.dotFill;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Context graph inside the halo, built edge by edge, then imploding toward
  // the center as the bubble deflates.
  const impl = st.implode;
  const nodeR = st.r * 0.78;
  const pts = CTX_GRAPHS[i].map((pt) => {
    const bx = st.x + pt.x * nodeR;
    const by = st.y + pt.y * nodeR;
    return {
      x: lerp(bx, st.x, impl * 0.25),
      y: lerp(by, st.y, impl * 0.25),
    };
  });
  const ctxVis = 1 - impl;
  const E = CTX_EDGES.length;
  CTX_EDGES.forEach(([a, b], k) => {
    const er = smoothstep(k / E, k / E + 0.25, st.build);
    if (er <= 0.001) return;
    ctx.globalAlpha = alpha * er * ctxVis;
    ctx.strokeStyle = `rgba(${c.nodeTintRgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });
  pts.forEach((pt, j) => {
    const nr = smoothstep((j / 7) * 0.8, (j / 7) * 0.8 + 0.2, st.build);
    if (nr <= 0.001) return;
    ctx.globalAlpha = alpha * nr * ctxVis;
    ctx.fillStyle = c.nodeTint;
    ctx.beginPath();
    ctx.arc(
      pt.x,
      pt.y,
      Math.max(1.4, 4 * st.scale - impl * 2),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });

  // Initial-letter badge: fades out during the deflate.
  if (st.fade > 0.001) {
    const bx = st.x - st.r * 0.78;
    const by = st.y - st.r * 0.78;
    const br = Math.max(6, 8 * st.scale);
    ctx.globalAlpha = alpha * st.fade;
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
    ctx.fillText(person.letter, bx, by + 0.5);
  }

  ctx.restore();
}
