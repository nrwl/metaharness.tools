/**
 * SessionMemory draw kernel (pure, no React).
 *
 * A before/after morph of what happens to a coding session when it ends:
 *
 *  - BEFORE (progress 0): each session pops up at a focal spot, builds a
 *    context graph inside a glowing circle, briefly connects to the repo(s) it
 *    touched, then the context dissolves inward and the whole session fades and
 *    vanishes. The next session repeats the cycle from scratch — amnesia.
 *  - AFTER (progress 1): the identical build phase, but on completion the
 *    session shrinks and DOCKS into a persistent memory band at the top instead
 *    of dissolving. Sessions accumulate, dashed reference links connect later
 *    sessions to earlier ones they cite (the cited session's halo flashes on
 *    reuse), and thin connectors persist down to the repos each session
 *    touched.
 *  - Mid-progress blends the two: the dissolve alpha scales with (1 - progress)
 *    while the dock travel scales with progress, so the tween reads as "the
 *    fading gets caught and pulled into place".
 *
 * Continuous cycling reads `elapsed`; the morph is driven by `progress`.
 * Adapted from Juri's Remotion `polygraph-opening` (amnesia) and
 * `polygraph-session-graph` (docking) clips, re-authored for canvas 2D and the
 * metaharness.tools site palette.
 */
import {
  drift,
  easeInOut,
  lerp,
  mulberry32,
  roundRectPath,
  smoothstep,
  type MorphFrame,
  type Pt,
} from '../../lib/anim';

/** Seconds per loop. */
export const CYCLE = 15.6;

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
const NODE_TINT = '#e1cba8';
const NODE_TINT_RGB = '225, 203, 168';
const FILL = '#171717';
const OUTLINE = '#262626';
const LINE = '#404040';
const TEXT_LABEL = '#a3a3a3';
const TEXT_HEADER = '#e5e5e5';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'ui-sans-serif, system-ui, -apple-system, sans-serif';

// ---------------------------------------------------------------------------
// Layout (960x600 logical). Sessions build at a focal spot in the upper area;
// the repo row sits along the bottom.
// ---------------------------------------------------------------------------
const BASE_W = 960;
const BASE_H = 600;

const FOCAL: Pt = { x: 480, y: 300 };
const BASE_R = 62;
const DOCK_SCALE = 0.6;

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

interface SessionDef {
  name: string;
  letter: string;
  /** Indices into REPOS this session touched. */
  repos: number[];
  /** Docked rest position in the memory band. */
  rest: Pt;
}

// Array order = creation order (a session can only reference an earlier one).
const SESSIONS: SessionDef[] = [
  { name: 'Maya', letter: 'M', repos: [0, 1], rest: { x: 214, y: 128 } },
  { name: 'Leo', letter: 'L', repos: [2], rest: { x: 366, y: 152 } },
  { name: 'Noah', letter: 'N', repos: [1], rest: { x: 512, y: 108 } },
  { name: 'Priya', letter: 'P', repos: [0, 2], rest: { x: 660, y: 146 } },
  { name: 'Elena', letter: 'E', repos: [0], rest: { x: 806, y: 120 } },
];

/** Dashed later-session -> earlier-session reference links (from > to). */
const REF_LINKS = [
  { from: 2, to: 1 }, // Noah -> Leo
  { from: 3, to: 2 }, // Priya -> Noah
  { from: 4, to: 3 }, // Elena -> Priya
  { from: 3, to: 0 }, // Priya -> Maya
];

// Inner context graph: 7 nodes seeded-random in a unit disc, fixed edges.
const CTX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [0, 3], [3, 4], [2, 5], [4, 6], [5, 6], [1, 5],
];

const CTX_GRAPHS: Pt[][] = SESSIONS.map((_, i) => {
  const rnd = mulberry32(0x9e3 + i * 1013);
  return Array.from({ length: 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.18 + rnd() * 0.62;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.86 };
  });
});

// ---------------------------------------------------------------------------
// Timeline. Repos draw first; sessions run staggered active windows, then the
// whole scene fades and loops.
// ---------------------------------------------------------------------------
const REPO_START = 0.15;
const REPO_STAGGER = 0.22;
const SESSION_START = 1.2;
const SESSION_GAP = 1.9;
const FADE = [13.8, 15.2] as const;

interface SessionState {
  u: number;
  pop: number;
  build: number;
  conn: number;
  dock: number;
  /** Context implosion amount (before-side dissolve). */
  implode: number;
  /** Session-fade-away amount (before-side amnesia). */
  forget: number;
  card: number;
  x: number;
  y: number;
  scale: number;
  r: number;
}

function sessionState(i: number, t: number, elapsed: number, p: number): SessionState {
  const u = t - (SESSION_START + i * SESSION_GAP);
  const pop = smoothstep(0, 0.35, u);
  const build = smoothstep(0.25, 1.4, u);
  const conn = smoothstep(0.95, 1.5, u);
  const dockRaw = smoothstep(1.5, 2.3, u);
  const dissolveRaw = smoothstep(1.5, 2.1, u);
  const forgetRaw = smoothstep(1.9, 2.55, u);

  // The morph: dock only in "after", dissolve/forget only in "before".
  const dock = dockRaw * p;
  const implode = dissolveRaw * (1 - p);
  const forget = forgetRaw * (1 - p);

  const rest = SESSIONS[i].rest;
  const d = drift(0.21 + i * 0.19, elapsed, 2.0);
  const de = easeInOut(dock);
  const x = lerp(FOCAL.x, rest.x, de) + d.x * dock;
  const y = lerp(FOCAL.y, rest.y, de) + d.y * dock;
  const scale = lerp(0.82, 1, easeInOut(pop)) * lerp(1, DOCK_SCALE, dock);
  const card = pop * (1 - smoothstep(1.5, 2.0, u));
  return {
    u,
    pop,
    build,
    conn,
    dock,
    implode,
    forget,
    card,
    x,
    y,
    scale,
    r: BASE_R * scale,
  };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawSessionMemory(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear, progress }: MorphFrame,
) {
  const t = elapsed % CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;

  const fit = Math.min(width / BASE_W, height / BASE_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  const states = SESSIONS.map((_, i) => sessionState(i, t, elapsed, p));

  drawRepoLayer(ctx, t, A);
  drawRefLinks(ctx, states, p, A);
  drawSessionConnectors(ctx, states, A);
  for (let i = 0; i < SESSIONS.length; i++) {
    drawSession(ctx, i, states, t, elapsed, p, A);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Repo row --------------------------------------------------------------
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

// ---- Session <-> session dashed reference links (after-side) ---------------
function drawRefLinks(
  ctx: CanvasRenderingContext2D,
  states: SessionState[],
  p: number,
  A: number,
) {
  if (p <= 0.01) return;
  for (const link of REF_LINKS) {
    const from = states[link.from];
    const to = states[link.to];
    const reveal = smoothstep(0.5, 1.3, from.u);
    if (reveal <= 0.001 || from.pop <= 0.01 || to.pop <= 0.01) continue;

    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const ax = from.x + Math.cos(ang) * (from.r + 4);
    const ay = from.y + Math.sin(ang) * (from.r + 4);
    const bx = to.x - Math.cos(ang) * (to.r + 4);
    const by = to.y - Math.sin(ang) * (to.r + 4);

    ctx.save();
    ctx.globalAlpha =
      0.6 * reveal * p * Math.min(from.pop, to.pop) * (1 - from.forget) * A;
    ctx.strokeStyle = `rgba(${NODE_TINT_RGB}, 0.55)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Session -> repo connectors --------------------------------------------
function drawSessionConnectors(
  ctx: CanvasRenderingContext2D,
  states: SessionState[],
  A: number,
) {
  SESSIONS.forEach((session, i) => {
    const st = states[i];
    if (st.conn <= 0.001) return;
    const vis = st.conn * (1 - st.forget);
    if (vis <= 0.001) return;
    for (const ri of session.repos) {
      const repo = REPOS[ri];
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
    }
  });
}

/** Incoming "context reuse" flash on a docked session cited by a later one. */
function incomingFlash(states: SessionState[], i: number, p: number): number {
  if (p <= 0.01) return 0;
  let f = 0;
  for (const link of REF_LINKS) {
    if (link.to !== i) continue;
    const from = states[link.from];
    // Triangle peaking as the citing session finishes building (~u 1.0).
    const d = Math.abs(from.u - 1.0);
    if (d < 0.35) f = Math.max(f, (1 - d / 0.35) * from.pop);
  }
  return f * p;
}

// ---- Session (halo + context graph + badge + card) -------------------------
function drawSession(
  ctx: CanvasRenderingContext2D,
  i: number,
  states: SessionState[],
  _t: number,
  _elapsed: number,
  p: number,
  A: number,
) {
  const st = states[i];
  if (st.pop <= 0.001) return;
  const session = SESSIONS[i];
  const alpha = st.pop * (1 - st.forget) * A;
  if (alpha <= 0.001) return;

  const flash = incomingFlash(states, i, p);

  ctx.save();

  // Halo: low-alpha accent glow (brightens briefly on context reuse).
  const glow = 0.07 + flash * 0.16;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgba(${ACCENT_RGB}, ${glow})`;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${ACCENT_RGB}, ${0.05 + flash * 0.12})`;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${0.16 + flash * 0.5})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
  ctx.stroke();

  // Context graph inside the halo. In "before" it implodes toward the center
  // and fades; in "after" it persists (shrunk with the docked circle).
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
    ctx.arc(pt.x, pt.y, Math.max(1.2, 3.2 * st.scale - impl * 1.5), 0, Math.PI * 2);
    ctx.fill();
  });

  // Initial-letter badge (persists when docked).
  const bx = st.x - st.r * 0.78;
  const by = st.y - st.r * 0.78;
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
  ctx.fillText(session.letter, bx, by + 0.5);

  // Session card next to the circle: fades out on completion (both sides).
  if (st.card > 0.001) {
    const cw = 96;
    const ch = 46;
    const cxr = st.x + st.r + 12;
    const cyr = st.y - ch / 2;
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
    ctx.fillText(session.name, cxr + 10, cyr + 18);
    ctx.fillStyle = LINE;
    ctx.fillRect(cxr + 10, cyr + 26, 62, 3);
    ctx.fillRect(cxr + 10, cyr + 33, 44, 3);
  }

  ctx.restore();
}
