/**
 * SessionDissolve draw kernel (pure, no React).
 *
 * The single-player version of session amnesia: one person, one repo row,
 * no memory. A session pops up at a focal spot, builds a context graph inside
 * a glowing circle, briefly connects to the repo it touched, then the context
 * implodes toward the center and the whole session fades away. A second
 * session by the same person repeats the exact same ritual against a different
 * repo, dissolves too, and the scene fades and loops. Nothing is ever kept.
 *
 * This is the "before" (amnesia) side of the SessionMemory kernel with the
 * docking, memory band, reference links, and morph progress stripped out.
 * Continuous cycling reads `elapsed`; there is no morph.
 */
import {
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
export const SESSION_DISSOLVE_CYCLE = 11;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'ui-sans-serif, system-ui, -apple-system, sans-serif';

// ---------------------------------------------------------------------------
// Layout (960x600 logical). Both session runs build at the same focal spot;
// the repo row sits along the bottom.
// ---------------------------------------------------------------------------
// (Base 960x600 design size is implicit in the CONTENT box below.)
// Content bounding box within BASE (focal cluster + "You" card + repo row and
// their labels), used to fit-and-centre the drawing to the canvas so it fills
// the frame instead of floating tiny in the middle on narrow widths.
const FIT_CX = 488;
const FIT_CY = 360;
const FIT_W = 580;
const FIT_H = 490;

const FOCAL: Pt = { x: 480, y: 235 };
const BASE_R = 88;

interface RepoDef {
  id: string;
  x: number;
  y: number;
}

const REPOS: RepoDef[] = [
  { id: 'frontend', x: 250, y: 480 },
  { id: 'design-system', x: 490, y: 545 },
  { id: 'backend', x: 730, y: 488 },
];

const REPO_EDGES = [
  { a: 0, b: 1, label: 'package' },
  { a: 0, b: 2, label: 'api' },
];

interface RunDef {
  /** Cycle time (seconds) at which this run pops in. */
  start: number;
  /** Index into REPOS this run touches. */
  repo: number;
}

// Two runs per cycle, both by the same person ("You").
const RUNS: RunDef[] = [
  { start: 1.2, repo: 0 }, // first session: frontend
  { start: 5.6, repo: 2 }, // second session: backend
];

const NAME = 'You';
const LETTER = 'Y';

// Inner context graph: 7 nodes seeded-random in a unit disc, fixed edges.
// A distinct seed per run so the second session builds a visibly different
// (but equally doomed) context graph.
const CTX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [0, 3], [3, 4], [2, 5], [4, 6], [5, 6], [1, 5],
];

const CTX_GRAPHS: Pt[][] = RUNS.map((_, i) => {
  const rnd = mulberry32(0x51d + i * 1013);
  return Array.from({ length: 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.18 + rnd() * 0.62;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.86 };
  });
});

// ---------------------------------------------------------------------------
// Timeline. Repos draw first; each run pops, builds, connects, dissolves; the
// whole scene fades and loops.
// ---------------------------------------------------------------------------
const FADE = [9.8, 11] as const;

interface RunState {
  u: number;
  pop: number;
  build: number;
  conn: number;
  /** Context implosion amount (nodes pull toward the center and fade). */
  implode: number;
  /** Session-fade-away amount (the amnesia). */
  forget: number;
  card: number;
  scale: number;
  r: number;
}

function runState(i: number, t: number): RunState {
  const u = t - RUNS[i].start;
  const pop = smoothstep(0, 0.4, u);
  const build = smoothstep(0.3, 1.8, u);
  const conn = smoothstep(1.3, 1.95, u);
  const implode = smoothstep(2.2, 2.9, u);
  const forget = smoothstep(2.7, 3.5, u);
  const scale = lerp(0.82, 1, easeInOut(pop));
  const card = pop * (1 - smoothstep(2.2, 2.8, u));
  return { u, pop, build, conn, implode, forget, card, scale, r: BASE_R * scale };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawSessionDissolve(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear, palette = DARK_PALETTE }: KernelFrame,
) {
  const t = elapsed % SESSION_DISSOLVE_CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  // Repo row is pinned to `appear` (scroll reveal) so it stays put; only the
  // session/focal cluster rides the per-cycle fade `A`.
  const A = appear * cycleFade;
  if (appear <= 0.001) return;

  // Fit the actual content bounding box (not the loose BASE canvas) so the
  // drawing fills the frame — critical on narrow/mobile widths where any empty
  // margin shrinks the legible content. Centre on the content, not BASE centre.
  const fit = Math.min(width / FIT_W, height / FIT_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-FIT_CX, -FIT_CY);

  drawRepoLayer(ctx, appear, palette);
  // Sessions are numbered continuously across cycles (Session 1, 2, 3, …) —
  // each cycle's runs continue the count, reinforcing the endless churn.
  const cyclesDone = Math.floor(elapsed / SESSION_DISSOLVE_CYCLE);
  for (let i = 0; i < RUNS.length; i++) {
    const st = runState(i, t);
    const sessionNum = cyclesDone * RUNS.length + i + 1;
    drawConnector(ctx, i, st, A, palette);
    drawSession(ctx, i, sessionNum, st, A, palette);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Repo row --------------------------------------------------------------
function drawRepoLayer(
  ctx: CanvasRenderingContext2D,
  A: number, // persistent scroll-reveal (not the per-cycle fade): repos stay put
  palette: VizPalette,
) {
  const ACCENT = palette.accent;
  const ACCENT_RGB = palette.accentRgb;
  const FILL = palette.surface;
  const LINE = palette.line;
  const TEXT_LABEL = palette.textLabel;
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
    ctx.strokeStyle = LINE;
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
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.12)`;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FILL;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_LABEL;
    ctx.fillText(repo.id, repo.x, repo.y + 28);
    ctx.restore();
  });
}

// ---- Session -> repo connector ---------------------------------------------
function drawConnector(
  ctx: CanvasRenderingContext2D,
  i: number,
  st: RunState,
  A: number,
  palette: VizPalette,
) {
  if (st.conn <= 0.001) return;
  const vis = st.conn * (1 - st.forget);
  if (vis <= 0.001) return;
  const repo = REPOS[RUNS[i].repo];
  const ang = Math.atan2(repo.y - FOCAL.y, repo.x - FOCAL.x);
  ctx.save();
  ctx.globalAlpha = vis * 0.45 * A;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(
    FOCAL.x + Math.cos(ang) * (st.r + 2),
    FOCAL.y + Math.sin(ang) * (st.r + 2),
  );
  ctx.lineTo(repo.x - Math.cos(ang) * 16, repo.y - Math.sin(ang) * 16);
  ctx.stroke();
  ctx.restore();
}

// ---- Session (halo + context graph + badge + card) -------------------------
function drawSession(
  ctx: CanvasRenderingContext2D,
  i: number,
  sessionNum: number,
  st: RunState,
  A: number,
  palette: VizPalette,
) {
  if (st.pop <= 0.001) return;
  const alpha = st.pop * (1 - st.forget) * A;
  if (alpha <= 0.001) return;

  const ACCENT_RGB = palette.accentRgb;
  const NODE_TINT = palette.accentSoft;
  const NODE_TINT_RGB = palette.nodeTintRgb;
  const FILL = palette.surface;
  const OUTLINE = palette.outline;
  const LINE = palette.line;
  const TEXT_HEADER = palette.textHeader;
  const TEXT_LABEL = palette.textLabel;

  ctx.save();

  // Halo: low-alpha accent glow.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.07)`;
  ctx.beginPath();
  ctx.arc(FOCAL.x, FOCAL.y, st.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.05)`;
  ctx.beginPath();
  ctx.arc(FOCAL.x, FOCAL.y, st.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.16)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(FOCAL.x, FOCAL.y, st.r, 0, Math.PI * 2);
  ctx.stroke();

  // Context graph inside the halo: builds edge by edge, then implodes toward
  // the center and fades as the session ends.
  const impl = st.implode;
  const nodeR = st.r * 0.78;
  const pts = CTX_GRAPHS[i].map((pt) => {
    const bx = FOCAL.x + pt.x * nodeR;
    const by = FOCAL.y + pt.y * nodeR;
    return {
      x: lerp(bx, FOCAL.x, impl * 0.25),
      y: lerp(by, FOCAL.y, impl * 0.25),
    };
  });
  const ctxVis = 1 - impl;
  const E = CTX_EDGES.length;
  CTX_EDGES.forEach(([a, b], k) => {
    const er = smoothstep(k / E, k / E + 0.25, st.build);
    if (er <= 0.001) return;
    ctx.globalAlpha = alpha * er * ctxVis;
    ctx.strokeStyle = `rgba(${NODE_TINT_RGB}, 0.35)`;
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
    ctx.fillStyle = NODE_TINT;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1.2, 3.2 * st.scale - impl * 1.5), 0, Math.PI * 2);
    ctx.fill();
  });

  // Initial-letter badge.
  const bx = FOCAL.x - st.r * 0.78;
  const by = FOCAL.y - st.r * 0.78;
  const br = Math.max(7, 9 * st.scale);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = FILL;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.55)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `9px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_HEADER;
  ctx.fillText(LETTER, bx, by + 0.5);

  // Caption identifying the circle as a session (first place we show this
  // element). Anchored above the full-size circle so it doesn't jump as the
  // halo grows.
  ctx.globalAlpha = alpha;
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_LABEL;
  ctx.fillText(`Session ${sessionNum}`, FOCAL.x, FOCAL.y - BASE_R - 14);

  // Session card next to the circle: fades out as the session dissolves.
  if (st.card > 0.001) {
    const cw = 96;
    const ch = 46;
    const cxr = FOCAL.x + st.r + 12;
    const cyr = FOCAL.y - ch / 2;
    ctx.globalAlpha = st.card * A;
    roundRectPath(ctx, cxr, cyr, cw, ch, 8);
    ctx.fillStyle = FILL;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `12px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = TEXT_HEADER;
    ctx.fillText(NAME, cxr + 10, cyr + 18);
    ctx.fillStyle = LINE;
    ctx.fillRect(cxr + 10, cyr + 26, 62, 3);
    ctx.fillRect(cxr + 10, cyr + 33, 44, 3);
  }

  ctx.restore();
}
