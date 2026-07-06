/**
 * RepositoryGraph draw kernel (pure, no React).
 *
 * A force-directed cloud of repositories: 40 accent "hub" repos in a loosely
 * cross-linked tree, 380 gray dependency/OSS repos hanging off them. The
 * layout is computed ONCE at module init with d3-force, fully deterministic
 * (seeded mulberry32 + synchronous ticks), so every load renders the same
 * cloud. The animation reveals nodes center-out while the camera zooms from
 * the pinned center node to fit the whole cloud, holds with a slow rotation,
 * fades and loops.
 */
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import {
  clamp01,
  easeInOut,
  easeOutBack,
  lerp,
  mulberry32,
  smoothstep,
  type KernelFrame,
} from '../../lib/anim';

/** Seconds per loop. */
export const CYCLE = 10;

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
const OSS_COLOR = '#6b7280';
const EDGE_GRAY = '#52525b';

// ---------------------------------------------------------------------------
// Graph construction (deterministic)
// ---------------------------------------------------------------------------
const SEED = 4242;
const N_HUBS = 40;
const N_OSS = 380;

type NodeKind = 'hub' | 'oss';
type LinkKind = 'pp' | 'po' | 'oo';

interface GraphNode extends SimulationNodeDatum {
  idx: number;
  kind: NodeKind;
  depth: number;
  degree: number;
  /** For hubs: number of oss repos attached directly. */
  childCount: number;
  r: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  kind: LinkKind;
}

function buildLayout() {
  const rnd = mulberry32(SEED);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  for (let i = 0; i < N_HUBS; i++) {
    nodes.push({
      idx: i,
      kind: 'hub',
      depth: 0,
      degree: 0,
      childCount: 0,
      r: 0,
      // Small deterministic jitter so the simulation does not start collapsed.
      x: (rnd() - 0.5) * 60,
      y: (rnd() - 0.5) * 60,
    });
  }
  // Connected random tree over the hubs...
  for (let i = 1; i < N_HUBS; i++) {
    links.push({ source: i, target: Math.floor(rnd() * i), kind: 'pp' });
  }
  // ...plus 28% extra cross-links.
  const extra = Math.round(N_HUBS * 0.28);
  let added = 0;
  let guard = 0;
  while (added < extra && guard++ < 200) {
    const a = Math.floor(rnd() * N_HUBS);
    const b = Math.floor(rnd() * N_HUBS);
    if (a === b) continue;
    links.push({ source: a, target: b, kind: 'pp' });
    added++;
  }

  // OSS nodes: chain off an earlier oss node (p=0.45) or attach to a hub.
  for (let i = 0; i < N_OSS; i++) {
    const id = N_HUBS + i;
    let parent: number;
    let kind: LinkKind;
    let depth: number;
    if (i > 0 && rnd() < 0.45) {
      parent = N_HUBS + Math.floor(rnd() * i);
      kind = 'oo';
      depth = nodes[parent].depth + 1;
    } else {
      parent = Math.floor(rnd() * N_HUBS);
      kind = 'po';
      depth = 1;
      nodes[parent].childCount++;
    }
    nodes.push({
      idx: id,
      kind: 'oss',
      depth,
      degree: 0,
      childCount: 0,
      r: 0,
      x: (rnd() - 0.5) * 800,
      y: (rnd() - 0.5) * 800,
    });
    links.push({ source: id, target: parent, kind });
  }

  // Degrees and radii.
  for (const l of links) {
    nodes[l.source as number].degree++;
    nodes[l.target as number].degree++;
  }
  for (const n of nodes) {
    n.r =
      n.kind === 'oss'
        ? Math.min(6.5, Math.max(3.6, 3.4 + Math.sqrt(n.degree) * 0.6))
        : Math.min(
            16,
            Math.max(6, 5.8 + Math.sqrt(n.childCount + n.degree * 2) * 1.3),
          );
  }

  // Pin the first hub at the exact center; the camera opens on it.
  nodes[0].fx = 0;
  nodes[0].fy = 0;

  const linkDistance: Record<LinkKind, number> = { oo: 48, po: 76, pp: 190 };
  const linkStrength: Record<LinkKind, number> = {
    oo: 0.04,
    po: 0.08,
    pp: 0.24,
  };

  const sim = forceSimulation<GraphNode>(nodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(links)
        .distance((l) => linkDistance[l.kind])
        .strength((l) => linkStrength[l.kind]),
    )
    .force(
      'charge',
      forceManyBody<GraphNode>().strength((n) =>
        n.kind === 'oss' ? -42 : -440,
      ),
    )
    .force(
      'collide',
      forceCollide<GraphNode>().radius((n) =>
        n.kind === 'oss' ? n.r + 3 : n.r + 8,
      ),
    )
    .force('center', forceCenter(0, 0).strength(0.015))
    .force(
      'radial',
      forceRadial<GraphNode>(
        (n) =>
          n.kind === 'oss'
            ? Math.min(540, 150 + n.depth * 78)
            : n.degree === 0
              ? 380
              : 80,
        0,
        0,
      ).strength((n) => (n.kind === 'oss' ? 0.06 : 0.02)),
    )
    .stop();
  for (let i = 0; i < 440; i++) sim.tick();

  // Flatten to plain arrays for cheap per-frame drawing.
  const pos = nodes.map((n) => ({
    x: n.x ?? 0,
    y: n.y ?? 0,
    r: n.r,
    kind: n.kind,
  }));
  const edges = links.map((l) => ({
    a: (l.source as GraphNode).idx,
    b: (l.target as GraphNode).idx,
    kind: l.kind,
  }));

  // Center-out reveal order -> per-node appear time.
  const INTRO_COUNT = 12;
  const INTRO_STEP = 0.13;
  const INTRO_END = INTRO_COUNT * INTRO_STEP;
  const CASCADE_DUR = 2.5;
  const order = pos
    .map((p, i) => ({ i, d: Math.hypot(p.x, p.y) }))
    .sort((a, b) => a.d - b.d);
  const appearAt = new Array<number>(pos.length);
  order.forEach(({ i }, rank) => {
    if (rank < INTRO_COUNT) {
      appearAt[i] = rank * INTRO_STEP;
    } else {
      const u = (rank - INTRO_COUNT) / (pos.length - INTRO_COUNT - 1);
      appearAt[i] = INTRO_END + CASCADE_DUR * Math.pow(u, 1.7);
    }
  });
  const revealEnd = INTRO_END + CASCADE_DUR;

  // 90th-percentile radius of the cloud, for the camera fit.
  const dists = order.map((o) => o.d);
  const fitRadius = dists[Math.floor(0.9 * (dists.length - 1))] + 30;

  return { pos, edges, appearAt, revealEnd, fitRadius };
}

const LAYOUT = buildLayout();

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const ZOOM_END = LAYOUT.revealEnd + 0.25; // camera settled shortly after reveal
const FADE = [8.6, 9.8] as const; // ~4s hold after zoom, then fade + loop

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawRepositoryGraph(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear }: KernelFrame,
) {
  const t = elapsed % CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;

  const { pos, edges, appearAt, fitRadius } = LAYOUT;
  const half = Math.min(width, height) / 2;

  // Camera: opens tight on the pinned center node, zooms out (cubic in/out on
  // progress, exponential interpolation of scale) to fit the cloud.
  const endScale = (half * 0.92) / fitRadius;
  const startScale = half / 70;
  const zp = easeInOut(clamp01(t / ZOOM_END));
  const scale =
    startScale * Math.pow(endScale / startScale, zp) * lerp(0.92, 1, appear);
  const rot = t * 0.012; // very subtle global rotation, incl. the hold

  // Per-node pop progress (slight back-overshoot on the radius).
  const prog = (i: number) => clamp01((t - appearAt[i]) / 0.35);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.rotate(rot);
  ctx.lineWidth = 1 / scale; // constant ~1px on screen

  // Edges first; each appears once both endpoints have.
  for (const e of edges) {
    const pa = prog(e.a);
    const pb = prog(e.b);
    if (pa <= 0 || pb <= 0) continue;
    const ea = Math.min(pa, pb);
    if (e.kind === 'pp') {
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.28 * ea * A;
    } else {
      ctx.strokeStyle = EDGE_GRAY;
      ctx.globalAlpha = 0.1 * ea * A;
    }
    ctx.beginPath();
    ctx.moveTo(pos[e.a].x, pos[e.a].y);
    ctx.lineTo(pos[e.b].x, pos[e.b].y);
    ctx.stroke();
  }

  // Faint accent halos under the hubs.
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    if (p.kind !== 'hub') continue;
    const pp = prog(i);
    if (pp <= 0) continue;
    ctx.globalAlpha = 0.08 * pp * A;
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 1)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nodes on top, popping in with a slight overshoot.
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    const pp = prog(i);
    if (pp <= 0) continue;
    const s = easeOutBack(pp);
    ctx.globalAlpha = clamp01(pp * 1.4) * A;
    ctx.fillStyle = p.kind === 'hub' ? ACCENT : OSS_COLOR;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, p.r * s), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
