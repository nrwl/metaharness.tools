/**
 * SessionNetwork draw kernel (pure, no React).
 *
 * Each session pops up at a shared focal spot, builds a small context graph,
 * attaches to the repo(s) it touched, then docks: the session card drops away
 * but the halo circle + mini graph shrink and park in a persistent memory
 * band at the top — the session stays around as a first-class object. Dashed
 * links between sessions show sessions referencing earlier ones.
 *
 * Ported from Juri's Remotion clip; adapted to canvas and the site palette.
 * The kernel derives everything from `elapsed`, so it can run standalone
 * (SessionNetwork component) or inside MetaHarnessLayers' expanded mode via
 * the `appear` transition parameter.
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
export const CYCLE = 13.8;

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
// Accent mixed ~30% toward white, for context-graph nodes.
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
// Layout, authored on a 960x600 logical canvas (reference clip was 2000x1100,
// coordinates roughly halved).
// ---------------------------------------------------------------------------
const BASE_W = 960;
const BASE_H = 600;

/** Focal spot where every session builds before docking. */
const FOCAL: Pt = { x: 480, y: 290 };
/** Session halo radius while active at the focal spot. */
const BASE_R = 66;
/** Scale a session shrinks to when docked into the memory band. */
const DOCK_SCALE = 0.62;

interface RepoDef {
  id: string;
  x: number;
  y: number;
}

const REPOS: RepoDef[] = [
  { id: 'frontend', x: 490, y: 390 },
  { id: 'design-system', x: 375, y: 490 },
  { id: 'backend', x: 700, y: 478 },
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

const SESSIONS: SessionDef[] = [
  { name: 'Juri', letter: 'J', repos: [0, 1], rest: { x: 290, y: 124 } },
  { name: 'Victor', letter: 'V', repos: [2], rest: { x: 572, y: 150 } },
  { name: 'James', letter: 'J', repos: [1], rest: { x: 750, y: 106 } },
  { name: 'Max', letter: 'M', repos: [0, 2], rest: { x: 428, y: 98 } },
];

/** Dashed session -> earlier-session reference links. */
const REF_LINKS = [
  { from: 3, to: 0 }, // Max -> Juri
  { from: 3, to: 1 }, // Max -> Victor
  { from: 2, to: 1 }, // James -> Victor
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
  const rnd = mulberry32(101 + i);
  return Array.from({ length: 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.18 + rnd() * 0.62;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.86 };
  });
});

// ---------------------------------------------------------------------------
// Timeline. Sessions overlap: each has a ~2.35s active window, the next
// starts 1.8s in. Repos build first, everything fades at the end and loops.
// ---------------------------------------------------------------------------
const REPO_START = 0.15;
const REPO_STAGGER = 0.22;
const SESSION_START = 1.4;
const SESSION_GAP = 1.8;
const FADE = [12.2, 13.4] as const;

interface SessionState {
  /** Session-local time. */
  u: number;
  pop: number; // fade + pop-in
  build: number; // context graph reveal
  conn: number; // repo connector fade-in
  dock: number; // focal -> rest travel
  card: number; // card alpha
  x: number;
  y: number;
  scale: number;
  r: number;
}

function sessionState(i: number, t: number, elapsed: number): SessionState {
  const u = t - (SESSION_START + i * SESSION_GAP);
  const pop = smoothstep(0, 0.35, u);
  const build = smoothstep(0.25, 1.45, u);
  const conn = smoothstep(0.95, 1.45, u);
  const dock = smoothstep(1.55, 2.35, u);
  const card = pop * (1 - smoothstep(1.55, 2.05, u));
  const rest = SESSIONS[i].rest;
  // Subtle idle drift once docked (scaled by dock so it eases in).
  const d = drift(0.21 + i * 0.19, elapsed, 2.2);
  const x = lerp(FOCAL.x, rest.x, dock) + d.x * dock;
  const y = lerp(FOCAL.y, rest.y, dock) + d.y * dock;
  const scale = lerp(0.82, 1, easeInOut(pop)) * lerp(1, DOCK_SCALE, dock);
  return { u, pop, build, conn, dock, card, x, y, scale, r: BASE_R * scale };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawSessionNetwork(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear }: KernelFrame,
) {
  const t = elapsed % CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;

  // Fit the authored layout into the canvas; explode transition adds a small
  // scale-in from 0.92 around the canvas center.
  const fit = Math.min(width / BASE_W, height / BASE_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  drawRepoLayer(ctx, t, A);
  drawRefLinks(ctx, t, elapsed, A);
  drawSessionConnectors(ctx, t, elapsed, A);
  for (let i = 0; i < SESSIONS.length; i++) {
    drawSession(ctx, i, t, elapsed, A);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Repo layer ------------------------------------------------------------
function drawRepoLayer(ctx: CanvasRenderingContext2D, t: number, A: number) {
  // Edges first (drawn on with endpoint travel), nodes above.
  REPO_EDGES.forEach((edge, e) => {
    const reveal = smoothstep(0.7 + e * 0.35, 1.5 + e * 0.35, t);
    if (reveal <= 0.001) return;
    const a = REPOS[edge.a];
    const b = REPOS[edge.b];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const pad = 20; // trim outside node radii
    const ax = a.x + Math.cos(ang) * pad;
    const ay = a.y + Math.sin(ang) * pad;
    const bx = b.x - Math.cos(ang) * pad;
    const by = b.y - Math.sin(ang) * pad;
    const tx = lerp(ax, bx, reveal);
    const ty = lerp(ay, by, reveal);

    ctx.save();
    ctx.globalAlpha = 0.9 * A;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Tiny arrowhead once the edge is fully drawn.
    if (reveal > 0.98) {
      const ah = 6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(
        bx - ah * Math.cos(ang - 0.44),
        by - ah * Math.sin(ang - 0.44),
      );
      ctx.moveTo(bx, by);
      ctx.lineTo(
        bx - ah * Math.cos(ang + 0.44),
        by - ah * Math.sin(ang + 0.44),
      );
      ctx.stroke();
    }

    // Small mono edge label at the midpoint, kept upright.
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    let la = ang;
    if (la > Math.PI / 2 || la < -Math.PI / 2) la += Math.PI;
    ctx.globalAlpha = 0.85 * reveal * A;
    ctx.translate(mx, my);
    ctx.rotate(la);
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_LABEL;
    ctx.fillText(edge.label, 0, -7);
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

    // Faint accent halo.
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.12)`;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 19 * s, 0, Math.PI * 2);
    ctx.fill();
    // Darker backing disc.
    ctx.fillStyle = FILL;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    // Solid accent core.
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 10 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_LABEL;
    ctx.fillText(repo.id, repo.x, repo.y + 30);
    ctx.restore();
  });
}

// ---- Session <-> session dashed reference links -----------------------------
function drawRefLinks(
  ctx: CanvasRenderingContext2D,
  t: number,
  elapsed: number,
  A: number,
) {
  for (const link of REF_LINKS) {
    const from = sessionState(link.from, t, elapsed);
    const to = sessionState(link.to, t, elapsed);
    // Reveal while the referencing session builds.
    const reveal = smoothstep(0.5, 1.3, from.u);
    if (reveal <= 0.001 || from.pop <= 0.01 || to.pop <= 0.01) continue;

    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const ax = from.x + Math.cos(ang) * (from.r + 4);
    const ay = from.y + Math.sin(ang) * (from.r + 4);
    const bx = to.x - Math.cos(ang) * (to.r + 4);
    const by = to.y - Math.sin(ang) * (to.r + 4);

    ctx.save();
    ctx.globalAlpha = 0.6 * Math.min(from.pop, to.pop) * A;
    ctx.strokeStyle = '#525252';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(lerp(ax, bx, reveal), lerp(ay, by, reveal));
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Session -> repo connectors ---------------------------------------------
function drawSessionConnectors(
  ctx: CanvasRenderingContext2D,
  t: number,
  elapsed: number,
  A: number,
) {
  SESSIONS.forEach((session, i) => {
    const st = sessionState(i, t, elapsed);
    if (st.conn <= 0.001) return;
    for (const ri of session.repos) {
      const repo = REPOS[ri];
      const ang = Math.atan2(repo.y - st.y, repo.x - st.x);
      ctx.save();
      ctx.globalAlpha = st.conn * 0.5 * A;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(
        st.x + Math.cos(ang) * (st.r + 2),
        st.y + Math.sin(ang) * (st.r + 2),
      );
      ctx.lineTo(
        repo.x - Math.cos(ang) * 18,
        repo.y - Math.sin(ang) * 18,
      );
      ctx.stroke();
      ctx.restore();
    }
  });
}

// ---- Session (halo + context graph + badge + card) --------------------------
function drawSession(
  ctx: CanvasRenderingContext2D,
  i: number,
  t: number,
  elapsed: number,
  A: number,
) {
  const st = sessionState(i, t, elapsed);
  if (st.pop <= 0.001) return;
  const session = SESSIONS[i];
  const alpha = st.pop * A;

  ctx.save();

  // Halo: two low-alpha accent fills + a whisper of an outline.
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

  // Context graph inside the halo (edges then nodes), revealed with build.
  const pts = CTX_GRAPHS[i].map((p) => ({
    x: st.x + p.x * st.r * 0.78,
    y: st.y + p.y * st.r * 0.78,
  }));
  const E = CTX_EDGES.length;
  CTX_EDGES.forEach(([a, b], k) => {
    const er = smoothstep(k / E, k / E + 0.25, st.build);
    if (er <= 0.001) return;
    ctx.globalAlpha = alpha * er;
    ctx.strokeStyle = `rgba(${NODE_TINT_RGB}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(
      lerp(pts[a].x, pts[b].x, er),
      lerp(pts[a].y, pts[b].y, er),
    );
    ctx.stroke();
  });
  pts.forEach((p, j) => {
    const nr = smoothstep((j / 7) * 0.8, (j / 7) * 0.8 + 0.2, st.build);
    if (nr <= 0.001) return;
    ctx.globalAlpha = alpha * nr;
    ctx.fillStyle = NODE_TINT;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2 * st.scale * nr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Initial-letter badge, top-left of the circle; persists when docked.
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

  // Session card next to the circle: name + 2 skeleton lines. Fades out
  // during dock — the halo + graph persist, the card does not.
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
