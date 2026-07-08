/**
 * SessionTimeline draw kernel (pure, no React).
 *
 * Multiplayer / collaboration story, in three acts:
 *   1. The original session-network intro: repos build at the bottom, a handful
 *      of sessions pop up at a focal spot, build a small context graph, attach
 *      to the repos they touched, and dock into a memory band — they stay.
 *   2. The repos fade away and those docked sessions morph into a horizontal
 *      session timeline (Polygraph's density-expanded time axis: date columns,
 *      seeded lanes), joined by more of the org's sessions and a web of curved
 *      reference edges.
 *   3. One session is selected: its edges light up, the rest dims, and a detail
 *      card appears.
 *
 * Timeline geometry mirrors Polygraph's session-graph (deterministic layout,
 * not a force sim). Everything derives from `elapsed`, holds, fades, and loops.
 */
import {
  clamp01,
  drift,
  easeInOut,
  easeOutBack,
  lerp,
  mulberry32,
  roundRectPath,
  smoothstep,
  type KernelFrame,
  type Pt,
} from '../../lib/anim';
import { DARK_PALETTE, type VizPalette } from '../../lib/palette';

/** Seconds per loop. */
export const CYCLE = 17.6;

// ---------------------------------------------------------------------------
// Palette — colors come from the theme {@link VizPalette} threaded on the
// frame; helpers receive it so the whole scene flips with the site toggle.
// ---------------------------------------------------------------------------
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'ui-sans-serif, system-ui, -apple-system, sans-serif';

/** Author tint fills: 8-way earthy set (resolved from `palette.tints`). */
const TINT_COUNT = 8;

// ---------------------------------------------------------------------------
// Layout, authored on a 960x600 logical canvas.
// ---------------------------------------------------------------------------
const BASE_W = 960;
const BASE_H = 600;

const FOCAL: Pt = { x: 480, y: 300 };
const BASE_R = 62; // session halo radius while active at the focal spot
const DOCK_SCALE = 0.6;
const NODE_R = 14; // timeline node radius (BASE units)

const REPOS = [
  { x: 470, y: 430, id: 'frontend' },
  { x: 350, y: 505, id: 'design-system' },
  { x: 650, y: 470, id: 'backend' },
];
const REPO_EDGES: ReadonlyArray<readonly [number, number, string]> = [
  [0, 1, 'package'],
  [0, 2, 'api'],
];

// Named hero sessions built in act 1 (ported from the original SessionNetwork),
// each touching one or more of the repos above.
const HERO_DEFS = [
  { name: 'Juri', letter: 'J', repos: [0, 1] },
  { name: 'Victor', letter: 'V', repos: [2] },
  { name: 'James', letter: 'J', repos: [1] },
  { name: 'Max', letter: 'M', repos: [0, 2] },
  { name: 'Nicole', letter: 'N', repos: [0] },
];

// Date columns, newest (index 0) on the right. `n` = drawn nodes, `count` =
// decorative header total.
const DAYS = [
  { label: 'Tue 7 Jul', count: 5, n: 5 },
  { label: 'Mon 6 Jul', count: 8, n: 4 },
  { label: 'Sun 5 Jul', count: 5, n: 3 },
  { label: 'Fri 3 Jul', count: 3, n: 4 },
  { label: 'Thu 2 Jul', count: 11, n: 5 },
  { label: 'Wed 1 Jul', count: 14, n: 3 },
];

const INITIALS = 'JVMRSKNZLCTBOAWPDEGH';

// Memory-band rest slots for the built (hero) sessions.
const RESTS: Pt[] = [
  { x: 250, y: 118 },
  { x: 410, y: 100 },
  { x: 560, y: 126 },
  { x: 700, y: 102 },
  { x: 820, y: 122 },
];

// Detail card content for the selected session.
const CARD = {
  name: 'MaxKless',
  handle: '@MaxKless',
  title: 'NXA-2017: Polygraph title selection in existing agent harness',
  meta: 'nrwl/polygraph-mcp · Jul 6',
};

// Inner context graph for the hero build (7 nodes, fixed edges).
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

interface Session {
  id: string;
  day: number;
  initial: string;
  /** Index into `palette.tints` for the avatar fill (resolved at draw time). */
  tintIdx: number;
  chevron: boolean;
  status: 'open' | 'done' | 'stale';
  /** Hero (act-1) name/letter/repos; empty for non-hero sessions. */
  name: string;
  letter: string;
  repos: number[];
  /** Timeline position in BASE canvas coords. */
  tx: number;
  ty: number;
  driftSeed: number;
  /** Hero (act-1 built) sessions only. */
  hero: boolean;
  restIdx: number; // -1 for non-hero
  order: number; // build order for heroes
  ctx: Pt[];
  appearAt: number; // timeline fade-in time for non-hero extras
}

interface Edge {
  a: number;
  b: number;
  bow: number;
  delay: number;
}

// ---------------------------------------------------------------------------
// Deterministic hashing (Polygraph parity) for lane assignment.
// ---------------------------------------------------------------------------
function stableSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Build (deterministic)
// ---------------------------------------------------------------------------
function build() {
  const rnd = mulberry32(73);
  const sessions: Session[] = [];

  // Time-axis bands (world coords, newest at x≈0 going left).
  const bands: { left: number; right: number; width: number; mid: number }[] =
    [];
  let cursor = 0;
  DAYS.forEach((d) => {
    const width = Math.max(120, d.count * 30);
    const right = cursor;
    const left = cursor - width;
    cursor = left;
    bands.push({ left, right, width, mid: (left + right) / 2 });
  });

  // World x per node within its band; collect nodes newest-first.
  const worldX: number[] = [];
  DAYS.forEach((d, di) => {
    const band = bands[di];
    for (let i = 0; i < d.n; i++) {
      const f = d.n === 1 ? 0.5 : i / (d.n - 1);
      const idx = sessions.length;
      worldX.push(band.right - (0.12 + f * 0.76) * band.width);
      sessions.push({
        id: `s${idx}`,
        day: di,
        initial: INITIALS[idx % INITIALS.length],
        tintIdx: idx % TINT_COUNT,
        chevron: rnd() < 0.45,
        status: rnd() < 0.22 ? 'done' : rnd() < 0.12 ? 'stale' : 'open',
        name: '',
        letter: '',
        repos: [],
        tx: 0,
        ty: 0,
        driftSeed: 0.3 + rnd() * 6,
        hero: false,
        restIdx: -1,
        order: 0,
        ctx: Array.from({ length: 7 }, () => {
          const a = rnd() * Math.PI * 2;
          const r = 0.18 + rnd() * 0.62;
          return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.86 };
        }),
        appearAt: 0,
      });
    }
  });

  // Seeded lane assignment (greedy, min separation).
  const LANE_SPAN = 560;
  const LANE_COUNT = 17;
  const MIN_SEP = NODE_R * 2 * 1.7;
  const laneY = Array.from(
    { length: LANE_COUNT },
    (_, i) => (i / (LANE_COUNT - 1) - 0.5) * LANE_SPAN,
  );
  const placed: Pt[] = [];
  const worldY: number[] = new Array(sessions.length);
  sessions.forEach((s, i) => {
    const r = makeRng(stableSeed(s.id));
    const lanes = laneY.map((_, k) => k);
    for (let k = lanes.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [lanes[k], lanes[j]] = [lanes[j], lanes[k]];
    }
    let bestY = laneY[lanes[0]];
    let bestD = -Infinity;
    for (const lane of lanes) {
      const cand = laneY[lane] + (r() - 0.5) * 14;
      let minD = Infinity;
      for (let p = 0; p < placed.length; p++) {
        if (Math.abs(placed[p].x - worldX[i]) > 2 * MIN_SEP) continue;
        minD = Math.min(minD, Math.hypot(placed[p].x - worldX[i], placed[p].y - cand));
      }
      if (minD >= MIN_SEP) {
        bestY = cand;
        break;
      }
      if (minD > bestD) {
        bestD = minD;
        bestY = cand;
      }
    }
    worldY[i] = bestY;
    placed.push({ x: worldX[i], y: bestY });
  });

  // Fit world bbox into a BASE region below the header band.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < sessions.length; i++) {
    minX = Math.min(minX, worldX[i]);
    maxX = Math.max(maxX, worldX[i]);
    minY = Math.min(minY, worldY[i]);
    maxY = Math.max(maxY, worldY[i]);
  }
  const RX0 = 48;
  const RX1 = BASE_W - 44;
  const RY0 = 118;
  const RY1 = BASE_H - 34;
  const fit = Math.min((RX1 - RX0) / (maxX - minX), (RY1 - RY0) / (maxY - minY));
  const offX = RX0 + ((RX1 - RX0) - (maxX - minX) * fit) / 2 - minX * fit;
  const offY = RY0 + ((RY1 - RY0) - (maxY - minY) * fit) / 2 - minY * fit;
  sessions.forEach((s, i) => {
    s.tx = offX + worldX[i] * fit;
    s.ty = offY + worldY[i] * fit;
  });

  // Band header x positions (BASE) for date columns.
  const headers = bands.map((b, di) => ({
    midX: offX + b.mid * fit,
    leftX: offX + b.left * fit,
    label: DAYS[di].label,
    count: DAYS[di].count,
  }));

  // Heroes: the named sessions, one per day, spread across the timeline. Kept
  // to 4 (like the original) so the act-1 build reads one-at-a-time.
  const HERO_COUNT = 4;
  let restCursor = 0;
  for (let di = 0; di < HERO_COUNT && restCursor < HERO_COUNT; di++) {
    const idx = sessions.findIndex((s) => s.day === di && !s.hero);
    if (idx < 0) continue;
    const def = HERO_DEFS[restCursor];
    const s = sessions[idx];
    s.hero = true;
    s.restIdx = restCursor;
    s.order = restCursor;
    s.name = def.name;
    s.letter = def.letter;
    s.initial = def.letter;
    s.repos = def.repos;
    restCursor++;
  }

  // Non-hero fade-in schedule (center-out during the transform).
  const extras = sessions
    .map((s, i) => ({ i, d: Math.hypot(s.tx - BASE_W / 2, s.ty - BASE_H / 2) }))
    .filter((o) => !sessions[o.i].hero)
    .sort((a, b) => a.d - b.d);
  extras.forEach((o, rank) => {
    sessions[o.i].appearAt = 8.4 + rank * 0.07;
  });

  // Selected: Max's session (matches the detail card author).
  let sel = sessions.findIndex((s) => s.hero && s.name === 'Max');
  if (sel < 0) sel = sessions.findIndex((s) => s.hero);
  if (sel < 0) sel = 0;

  // Reference edges.
  const set = new Set<string>();
  const edges: Edge[] = [];
  const add = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (set.has(key)) return;
    set.add(key);
    edges.push({ a, b, bow: rnd() < 0.5 ? -1 : 1, delay: rnd() * 1.4 });
  };
  for (let i = 0; i < sessions.length; i++) {
    const links = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < links; k++) add(i, Math.floor(rnd() * sessions.length));
  }
  const near = sessions
    .map((s, i) => ({ i, d: Math.hypot(s.tx - sessions[sel].tx, s.ty - sessions[sel].ty) }))
    .filter((o) => o.i !== sel)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  near.forEach((o) => add(sel, o.i));

  const neighbors = new Set<number>();
  for (const e of edges) {
    if (e.a === sel) neighbors.add(e.b);
    if (e.b === sel) neighbors.add(e.a);
  }

  // Starfield (subtle backdrop, revealed with the timeline).
  const sr = makeRng(92821);
  const stars = Array.from({ length: 120 }, () => ({
    x: sr() * BASE_W,
    y: sr() * BASE_H,
    r: sr() * 1.3 + 0.3,
    a: sr() * 0.28 + 0.05,
  }));

  return { sessions, edges, headers, neighbors, sel, stars };
}

const G = build();

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const REPO_START = 0.15;
const REPO_STAGGER = 0.22;
const SESSION_START = 1.0;
const SESSION_GAP = 1.6; // wide enough that each session docks before the next
const TF0 = 7.6; // transform to timeline begins
const REPO_FADE = [7.6, 8.8] as const;
const SEL0 = 11.4;
const SEL1 = 12.5;
const FADE = [16.0, 17.4] as const;

interface HeroState {
  pop: number;
  build: number;
  conn: number;
  dock: number;
  card: number;
  x: number;
  y: number;
  scale: number;
  r: number;
}

function heroAct1(s: Session, t: number, elapsed: number): HeroState {
  const u = t - (SESSION_START + s.order * SESSION_GAP);
  const pop = smoothstep(0, 0.3, u);
  const build = smoothstep(0.2, 1.0, u);
  const conn = smoothstep(0.6, 1.0, u);
  const dock = smoothstep(1.05, 1.7, u);
  const card = pop * (1 - smoothstep(1.05, 1.5, u));
  const rest = RESTS[s.restIdx];
  const d = drift(0.21 + s.order * 0.19, elapsed, 2.2);
  const x = lerp(FOCAL.x, rest.x, dock) + d.x * dock;
  const y = lerp(FOCAL.y, rest.y, dock) + d.y * dock;
  const scale = lerp(0.82, 1, easeInOut(pop)) * lerp(1, DOCK_SCALE, dock);
  return { pop, build, conn, dock, card, x, y, scale, r: BASE_R * scale };
}

/** Per-session timeline presence (0..1) and live position. */
function timelineOf(i: number, t: number, elapsed: number) {
  const s = G.sessions[i];
  // Timeline positions are static (no idle wiggle); flow is shown on the arcs.
  const tx = s.tx;
  const ty = s.ty;
  if (s.hero) {
    const h = heroAct1(s, t, elapsed);
    const tl = smoothstep(TF0 + s.order * 0.16, TF0 + s.order * 0.16 + 2.4, t);
    return {
      present: tl,
      x: lerp(h.x, tx, tl),
      y: lerp(h.y, ty, tl),
    };
  }
  const ap = smoothstep(s.appearAt, s.appearAt + 0.5, t);
  return { present: ap, x: tx, y: ty };
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawSessionTimeline(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear, palette = DARK_PALETTE }: KernelFrame,
) {
  const t = elapsed % CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;

  const repoFade = 1 - smoothstep(REPO_FADE[0], REPO_FADE[1], t);
  const tlP = smoothstep(TF0 + 0.3, TF0 + 3.0, t);
  const headerP = smoothstep(TF0 + 0.6, TF0 + 2.2, t);
  const selectP = smoothstep(SEL0, SEL1, t);

  const fit = Math.min(width / BASE_W, height / BASE_H);
  const sc = fit * lerp(0.94, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  drawStars(ctx, tlP * 0.9 * A, palette);
  drawColumns(ctx, headerP * A, palette);
  if (repoFade > 0.001) drawRepoLayer(ctx, t, A * repoFade, palette);

  // Reference edges (curved), gated by both endpoints' presence.
  for (const e of G.edges) {
    const pa = timelineOf(e.a, t, elapsed);
    const pb = timelineOf(e.b, t, elapsed);
    const pres = Math.min(pa.present, pb.present);
    const reveal = pres * smoothstep(TF0 + 1.0 + e.delay, TF0 + 1.9 + e.delay, t);
    if (reveal <= 0.001) continue;
    const isSel = e.a === G.sel || e.b === G.sel;
    const dim = isSel ? 1 : lerp(1, 0.22, selectP);
    strokeCurve(
      ctx,
      pa,
      pb,
      e.bow,
      `rgba(${palette.edgeRgb}, ${0.28 * reveal * dim * A})`,
      1.5,
    );
  }

  // Gold selected edges on top.
  if (selectP > 0.001) {
    const ps = timelineOf(G.sel, t, elapsed);
    for (const e of G.edges) {
      if (e.a !== G.sel && e.b !== G.sel) continue;
      const other = e.a === G.sel ? e.b : e.a;
      const po = timelineOf(other, t, elapsed);
      // Curve runs Max -> other (u=0 at Max); flow the dot inward toward Max.
      const pulseU = 1 - ((elapsed * 0.34 + e.delay) % 1);
      strokeCurve(
        ctx,
        ps,
        po,
        e.bow,
        `rgba(${palette.accentRgb}, ${0.85 * selectP * Math.min(po.present, 1) * A})`,
        2.1,
        pulseU,
        `rgba(${palette.accentRgb}, ${0.95 * selectP * Math.min(po.present, 1) * A})`,
        2.4,
      );
    }
  }

  // Sessions: hero act-1 richness cross-fades into the timeline node.
  for (let i = 0; i < G.sessions.length; i++) {
    const s = G.sessions[i];
    const live = timelineOf(i, t, elapsed);
    if (s.hero) {
      const h = heroAct1(s, t, elapsed);
      const rich = h.pop * (1 - live.present);
      if (rich > 0.001) {
        const hl = { ...h, x: live.x, y: live.y };
        if (repoFade > 0.001) {
          drawHeroConnectors(ctx, s, hl, h.conn * rich * repoFade * A, palette);
        }
        drawHeroRich(ctx, s, hl, rich * A, palette);
      }
    }
    if (live.present > 0.001) {
      const isSel = i === G.sel;
      const isNbr = G.neighbors.has(i);
      const focus = isSel || isNbr ? 1 : lerp(1, 0.16, selectP);
      drawTimelineNode(
        ctx,
        s,
        live,
        live.present * A,
        focus,
        isSel ? selectP : 0,
        palette,
      );
    }
  }

  if (selectP > 0.001) {
    const ps = timelineOf(G.sel, t, elapsed);
    drawCard(ctx, ps, selectP * A, palette);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- Starfield -------------------------------------------------------------
function drawStars(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  palette: VizPalette,
) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.fillStyle = palette.star;
  for (const st of G.stars) {
    ctx.globalAlpha = st.a * alpha;
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Date columns ----------------------------------------------------------
function drawColumns(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  palette: VizPalette,
) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.textAlign = 'center';
  G.headers.forEach((h, i) => {
    if (i > 0) {
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = palette.divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(h.leftX, 96);
      ctx.lineTo(h.leftX, BASE_H - 22);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.textDim;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `11px ${MONO}`;
    ctx.fillText(h.label, h.midX, 46);
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = palette.textFaint;
    ctx.fillText(`${h.count} sessions`, h.midX, 62);
  });
  ctx.restore();
}

// ---- Repo backdrop (original session-network layer, fading out) ------------
function drawRepoLayer(
  ctx: CanvasRenderingContext2D,
  t: number,
  A: number,
  palette: VizPalette,
) {
  REPO_EDGES.forEach(([ai, bi, label], e) => {
    const reveal = smoothstep(0.7 + e * 0.35, 1.5 + e * 0.35, t);
    if (reveal <= 0.001) return;
    const a = REPOS[ai];
    const b = REPOS[bi];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ax = a.x + Math.cos(ang) * 20;
    const ay = a.y + Math.sin(ang) * 20;
    const bx = b.x - Math.cos(ang) * 20;
    const by = b.y - Math.sin(ang) * 20;
    ctx.save();
    ctx.globalAlpha = 0.9 * A;
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(lerp(ax, bx, reveal), lerp(ay, by, reveal));
    ctx.stroke();
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
    ctx.fillStyle = palette.textLabel;
    ctx.fillText(label, 0, -7);
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
    ctx.fillStyle = `rgba(${palette.accentRgb}, 0.12)`;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 19 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.surface;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(repo.x, repo.y, 10 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.textLabel;
    ctx.fillText(repo.id, repo.x, repo.y + 30);
    ctx.restore();
  });
}

// ---- Hero session (act 1: halo + context graph + badge + card) -------------
function drawHeroRich(
  ctx: CanvasRenderingContext2D,
  s: Session,
  h: HeroState,
  alpha: number,
  palette: VizPalette,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = `rgba(${palette.accentRgb}, 0.07)`;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.accentRgb}, 0.16)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
  ctx.stroke();

  const pts = s.ctx.map((p) => ({
    x: h.x + p.x * h.r * 0.78,
    y: h.y + p.y * h.r * 0.78,
  }));
  const E = CTX_EDGES.length;
  CTX_EDGES.forEach(([a, b], k) => {
    const er = smoothstep(k / E, k / E + 0.25, h.build);
    if (er <= 0.001) return;
    ctx.globalAlpha = alpha * er;
    ctx.strokeStyle = `rgba(${palette.nodeTintRgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(lerp(pts[a].x, pts[b].x, er), lerp(pts[a].y, pts[b].y, er));
    ctx.stroke();
  });
  pts.forEach((p, j) => {
    const nr = smoothstep((j / 7) * 0.8, (j / 7) * 0.8 + 0.2, h.build);
    if (nr <= 0.001) return;
    ctx.globalAlpha = alpha * nr;
    ctx.fillStyle = `rgb(${palette.nodeTintRgb})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2 * h.scale * nr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Initial-letter badge, top-left of the circle.
  const bx = h.x - h.r * 0.78;
  const by = h.y - h.r * 0.78;
  const br = Math.max(7, 9 * h.scale);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.surface;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.accentRgb}, 0.55)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `9px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.textHeader;
  ctx.fillText(s.letter, bx, by + 0.5);

  // "session" tag under the bubble, so it reads as a session being visualized.
  if (h.card > 0.001) {
    ctx.globalAlpha = h.card * alpha;
    ctx.font = `9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.textLabel;
    ctx.fillText('session', h.x, h.y + h.r + 14);
  }

  // Session name card next to the circle during build.
  if (h.card > 0.001) {
    const cw = 108;
    const ch = 44;
    const cx = h.x + h.r + 12;
    const cy = h.y - ch / 2;
    ctx.globalAlpha = h.card * alpha;
    roundRectPath(ctx, cx, cy, cw, ch, 8);
    ctx.fillStyle = palette.surface;
    ctx.fill();
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `12px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.textHeader;
    ctx.fillText(s.name, cx + 10, cy + 18);
    ctx.fillStyle = palette.line;
    ctx.fillRect(cx + 10, cy + 26, 62, 3);
    ctx.fillRect(cx + 10, cy + 33, 44, 3);
  }

  ctx.restore();
}

// ---- Hero session -> repo connectors (act 1) -------------------------------
function drawHeroConnectors(
  ctx: CanvasRenderingContext2D,
  s: Session,
  h: HeroState,
  alpha: number,
  palette: VizPalette,
) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1;
  for (const ri of s.repos) {
    const repo = REPOS[ri];
    const ang = Math.atan2(repo.y - h.y, repo.x - h.x);
    ctx.beginPath();
    ctx.moveTo(h.x + Math.cos(ang) * (h.r + 2), h.y + Math.sin(ang) * (h.r + 2));
    ctx.lineTo(repo.x - Math.cos(ang) * 18, repo.y - Math.sin(ang) * 18);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Timeline session node -------------------------------------------------
function drawTimelineNode(
  ctx: CanvasRenderingContext2D,
  s: Session,
  live: { x: number; y: number },
  alpha: number,
  focus: number,
  sel: number,
  palette: VizPalette,
) {
  const pop = easeOutBack(clamp01(alpha));
  const r = NODE_R * lerp(0.9, 1, pop) * lerp(1, 1.16, sel);
  ctx.save();
  ctx.globalAlpha = alpha * focus;

  if (sel > 0.001) {
    ctx.fillStyle = `rgba(${palette.accentRgb}, ${0.2 * sel})`;
    ctx.beginPath();
    ctx.arc(live.x, live.y, r * 1.95, 0, Math.PI * 2);
    ctx.fill();
  }

  // Avatar (tint fill).
  ctx.fillStyle = palette.tints[s.tintIdx];
  ctx.beginPath();
  ctx.arc(live.x, live.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = sel > 0.001 ? 2.5 : 1;
  ctx.strokeStyle = sel > 0.001 ? palette.accent : `rgba(${palette.edgeRgb}, 0.22)`;
  ctx.beginPath();
  ctx.arc(live.x, live.y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = palette.nodeText;
  ctx.font = `600 ${Math.round(r * 0.82)}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.initial, live.x, live.y + 0.5);

  // Status dot (non-open).
  if (s.status !== 'open') {
    ctx.globalAlpha = alpha * focus;
    ctx.fillStyle = s.status === 'done' ? palette.statusDone : palette.statusStale;
    ctx.beginPath();
    ctx.arc(live.x + r * 0.72, live.y + r * 0.72, Math.max(2.4, r * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }

  // Gold "older relations" chevron.
  if (s.chevron) {
    ctx.globalAlpha = alpha * focus * 0.9;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const cx = live.x - r - 4;
    ctx.beginPath();
    ctx.moveTo(cx, live.y - 3.5);
    ctx.lineTo(cx - 3.5, live.y);
    ctx.lineTo(cx, live.y + 3.5);
    ctx.stroke();
  }

  ctx.restore();
}

// ---- Curved edge -----------------------------------------------------------
function strokeCurve(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  bow: number,
  stroke: string,
  width: number,
  pulseU = -1,
  pulseColor = '',
  pulseR = 1.8,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bowMag = Math.max(12, Math.min(70, len * 0.13)) * bow;
  const cx = (a.x + b.x) / 2 + (-dy / len) * bowMag;
  const cy = (a.y + b.y) / 2 + (dx / len) * bowMag;
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cx, cy, b.x, b.y);
  ctx.stroke();
  // A dot travelling along the arc to suggest data flow.
  if (pulseU >= 0 && pulseColor) {
    const mu = 1 - pulseU;
    const px = mu * mu * a.x + 2 * mu * pulseU * cx + pulseU * pulseU * b.x;
    const py = mu * mu * a.y + 2 * mu * pulseU * cy + pulseU * pulseU * b.y;
    ctx.fillStyle = pulseColor;
    ctx.beginPath();
    ctx.arc(px, py, pulseR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Detail card -----------------------------------------------------------
function drawCard(
  ctx: CanvasRenderingContext2D,
  node: Pt,
  alpha: number,
  palette: VizPalette,
) {
  const cw = 232;
  const ch = 96;
  const right = node.x + 20 + cw < BASE_W;
  const cx = right ? node.x + 20 : node.x - 20 - cw;
  const cy = Math.max(8, Math.min(BASE_H - ch - 8, node.y - 12));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `rgba(${palette.accentRgb}, 0.5)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(node.x, node.y);
  ctx.lineTo(right ? cx : cx + cw, cy + 22);
  ctx.stroke();

  roundRectPath(ctx, cx, cy, cw, ch, 10);
  ctx.fillStyle = palette.cardFill;
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.edgeRgb}, 0.12)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  const px = cx + 14;
  ctx.fillStyle = palette.tints[1];
  ctx.beginPath();
  ctx.arc(px + 9, cy + 20, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = palette.textHeader;
  ctx.font = `600 13px ${SANS}`;
  ctx.fillText(CARD.name, px + 26, cy + 18);
  ctx.fillStyle = palette.textDim;
  ctx.font = `11px ${MONO}`;
  ctx.fillText(CARD.handle, px + 26, cy + 31);

  ctx.fillStyle = palette.textHeader;
  ctx.font = `13px ${SANS}`;
  wrapText(ctx, CARD.title, px, cy + 54, cw - 28, 16, 2);

  ctx.fillStyle = palette.textFaint;
  ctx.font = `11px ${MONO}`;
  ctx.fillText(CARD.meta, px, cy + ch - 12);
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
) {
  const words = text.split(' ');
  const all: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      all.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) all.push(line);
  const lines = all.slice(0, maxLines);
  if (all.length > maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxW && last.length > 1) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
