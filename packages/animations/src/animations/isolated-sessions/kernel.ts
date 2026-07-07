/**
 * IsolatedSessions draw kernel (pure, no React).
 *
 * The "real work is multiplayer" problem: four teammates each run agent
 * sessions, but every session is an island local to that person's machine.
 * Each person has a persistent laptop glyph; session bubbles pop up above it,
 * tethered to it by a faint dashed line, build a context graph, briefly
 * connect down to one shared repo, then the context implodes and the session
 * fades away without leaving anything behind. Later in the cycle some people
 * start a second session and the amnesia repeats. Crucially there are NO
 * session-to-session links of any kind: the repos below are shared, the
 * sessions never are.
 *
 * Adapted from the session-memory kernel's before-side (repo row, session
 * halo, context graph, implode/forget), with the dock/morph plumbing removed.
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

/** Seconds per loop. */
export const ISOLATED_SESSIONS_CYCLE = 14;

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
const NODE_TINT = '#e1cba8';
const NODE_TINT_RGB = '225, 203, 168';
const FILL = '#171717';
const LINE = '#404040';
const TEXT_LABEL = '#a3a3a3';
const TEXT_HEADER = '#e5e5e5';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout (960x600 logical). People spread across the upper half, each with a
// laptop below their session spot; the shared repo row sits along the bottom.
// ---------------------------------------------------------------------------
const BASE_W = 960;
const BASE_H = 600;

const SESSION_R = 46;

interface RepoDef {
  id: string;
  x: number;
  y: number;
}

const REPOS: RepoDef[] = [
  { id: 'frontend', x: 360, y: 472 },
  { id: 'design-system', x: 500, y: 522 },
  { id: 'backend', x: 640, y: 478 },
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
  { name: 'Juri', letter: 'J', x: 150, y: 236, repo: 0 },
  { name: 'Victor', letter: 'V', x: 370, y: 222, repo: 2 },
  { name: 'James', letter: 'J', x: 590, y: 246, repo: 1 },
  { name: 'Nadia', letter: 'N', x: 810, y: 230, repo: 0 },
];

/** Vertical offset from a person's home position to their laptop baseline. */
const LAPTOP_DY = 108;

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
// Timeline. Repos draw first, laptops pop in early and stay, session runs
// come and go, then the whole scene fades and loops.
// ---------------------------------------------------------------------------
const REPO_START = 0.15;
const REPO_STAGGER = 0.22;
const LAPTOP_START = 0.4;
const LAPTOP_STAGGER = 0.16;
const FADE = [12.4, 13.8] as const;

interface RunState {
  u: number;
  pop: number;
  build: number;
  conn: number;
  /** Context implosion amount (dissolve inward). */
  implode: number;
  /** Session-fade-away amount (amnesia). */
  forget: number;
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
  const forget = smoothstep(2.0, 2.7, u);

  const person = PEOPLE[RUNS[i].person];
  const d = drift(0.21 + i * 0.19, elapsed, 1.6);
  const scale = lerp(0.82, 1, easeInOut(pop));
  return {
    u,
    pop,
    build,
    conn,
    implode,
    forget,
    x: person.x + d.x,
    y: person.y + d.y,
    scale,
    r: SESSION_R * scale,
  };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawIsolatedSessions(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear }: KernelFrame,
) {
  const t = elapsed % ISOLATED_SESSIONS_CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;

  const fit = Math.min(width / BASE_W, height / BASE_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  const states = RUNS.map((_, i) => runState(i, t, elapsed));

  drawRepoLayer(ctx, t, A);
  drawLaptops(ctx, t, A);
  drawTethers(ctx, states, A);
  drawRepoConnectors(ctx, states, A);
  for (let i = 0; i < RUNS.length; i++) {
    drawSession(ctx, i, states[i], A);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Shared repo row --------------------------------------------------------
function drawRepoLayer(ctx: CanvasRenderingContext2D, t: number, A: number) {
  REPO_EDGES.forEach((edge, e) => {
    const reveal = smoothstep(0.7 + e * 0.3, 1.4 + e * 0.3, t);
    if (reveal <= 0.001) return;
    const a = REPOS[edge.a];
    const b = REPOS[edge.b];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const pad = 18;
    const ax = a.x + Math.cos(ang) * pad;
    const ay = a.y + Math.sin(ang) * pad;
    const bx = b.x - Math.cos(ang) * pad;
    const by = b.y - Math.sin(ang) * pad;
    ctx.save();
    ctx.globalAlpha = 0.9 * reveal * A;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(lerp(ax, bx, reveal), lerp(ay, by, reveal));
    ctx.stroke();
    ctx.restore();
  });

  REPOS.forEach((repo, i) => {
    const pop = smoothstep(
      REPO_START + i * REPO_STAGGER,
      REPO_START + i * REPO_STAGGER + 0.4,
      t,
    );
    if (pop <= 0.001) return;
    const s = lerp(0.6, 1, easeInOut(pop));
    ctx.save();
    ctx.globalAlpha = pop * A;
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.12)`;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 17 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FILL;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_LABEL;
    ctx.fillText(repo.id, repo.x, repo.y + 28);
    ctx.restore();
  });
}

// ---- Laptops (each person's local machine, persistent) ----------------------
function drawLaptops(ctx: CanvasRenderingContext2D, t: number, A: number) {
  PEOPLE.forEach((person, i) => {
    const pop = smoothstep(
      LAPTOP_START + i * LAPTOP_STAGGER,
      LAPTOP_START + i * LAPTOP_STAGGER + 0.35,
      t,
    );
    if (pop <= 0.001) return;
    const s = lerp(0.7, 1, easeInOut(pop));
    const x = person.x;
    const by = person.y + LAPTOP_DY; // screen baseline (hinge)

    ctx.save();
    ctx.globalAlpha = 0.9 * pop * A;
    ctx.lineWidth = 1;

    // Screen: rounded rect above the hinge.
    const sw = 34 * s;
    const sh = 22 * s;
    roundRectPath(ctx, x - sw / 2, by - sh, sw, sh, 3 * s);
    ctx.fillStyle = FILL;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.stroke();

    // Base: slightly wider flat trapezoid under the screen.
    ctx.beginPath();
    ctx.moveTo(x - sw / 2 - 2 * s, by);
    ctx.lineTo(x + sw / 2 + 2 * s, by);
    ctx.lineTo(x + sw / 2 + 6 * s, by + 4 * s);
    ctx.lineTo(x - sw / 2 - 6 * s, by + 4 * s);
    ctx.closePath();
    ctx.fillStyle = FILL;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.stroke();

    // Name under the machine.
    ctx.globalAlpha = pop * A;
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_LABEL;
    ctx.fillText(person.name, x, by + 20);
    ctx.restore();
  });
}

// ---- Session -> laptop tethers ----------------------------------------------
function drawTethers(
  ctx: CanvasRenderingContext2D,
  states: RunState[],
  A: number,
) {
  RUNS.forEach((run, i) => {
    const st = states[i];
    const vis = st.pop * (1 - st.forget);
    if (vis <= 0.001) return;
    const person = PEOPLE[run.person];
    const topY = person.y + LAPTOP_DY - 26; // just above the laptop screen
    ctx.save();
    ctx.globalAlpha = 0.5 * vis * A;
    ctx.strokeStyle = LINE;
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
) {
  RUNS.forEach((run, i) => {
    const st = states[i];
    if (st.conn <= 0.001) return;
    const vis = st.conn * (1 - st.forget);
    if (vis <= 0.001) return;
    const repo = REPOS[PEOPLE[run.person].repo];
    const ang = Math.atan2(repo.y - st.y, repo.x - st.x);
    ctx.save();
    ctx.globalAlpha = vis * 0.45 * A;
    ctx.strokeStyle = ACCENT;
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

// ---- Session bubble (halo + context graph + badge) ---------------------------
function drawSession(
  ctx: CanvasRenderingContext2D,
  i: number,
  st: RunState,
  A: number,
) {
  if (st.pop <= 0.001) return;
  const person = PEOPLE[RUNS[i].person];
  const alpha = st.pop * (1 - st.forget) * A;
  if (alpha <= 0.001) return;

  ctx.save();

  // Halo: low-alpha accent glow.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.07)`;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.05)`;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.16)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.stroke();

  // Context graph inside the halo, built edge by edge, then imploding toward
  // the center as the session dissolves.
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
    ctx.arc(
      pt.x,
      pt.y,
      Math.max(1.2, 3 * st.scale - impl * 1.5),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });

  // Initial-letter badge.
  const bx = st.x - st.r * 0.78;
  const by = st.y - st.r * 0.78;
  const br = Math.max(6, 8 * st.scale);
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
  ctx.fillText(person.letter, bx, by + 0.5);

  ctx.restore();
}
