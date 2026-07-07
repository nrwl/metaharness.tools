/**
 * RepositoryGraph draw kernel (pure, no React).
 *
 * The animation opens on three big, labelled hub repositories (frontend,
 * backend, design system), then grows into a full, irregular cloud: 40 accent
 * hub repos in a loosely cross-linked tree, 380 gray dependency/OSS repos
 * hanging off them. The three labelled hubs shrink toward normal graph nodes,
 * their labels fade, and edges reach out to more and more dots. The camera
 * eases out only mildly, so the growth of the network carries the zoom rather
 * than a hard scale change. The layout is computed ONCE at module init with
 * d3-force, fully deterministic (seeded mulberry32 + synchronous ticks), so
 * every load renders the same cloud. Holds with a slow rotation, fades, loops.
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
export const CYCLE = 13;

const fract = (x: number) => x - Math.floor(x);

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
const OSS_COLOR = '#6b7280';
const EDGE_GRAY = '#52525b';
const LABEL_COLOR = '#e5e5e5';

// ---------------------------------------------------------------------------
// Graph construction (deterministic)
// ---------------------------------------------------------------------------
const SEED = 4242;
const N_HUBS = 40;
const N_OSS = 380;

/** The first three hubs are the labelled, intro-featured repositories. */
const N_PRIM = 3;
const PRIM_LABELS = ['frontend', 'backend', 'design system'];
/** Irregular (non-symmetric) near-center anchors for the three primaries. */
const PRIM_POS: ReadonlyArray<readonly [number, number]> = [
  [-40, -58],
  [72, -30],
  [-8, 76],
];

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
  // Pin the three primaries at irregular near-center anchors so the intro
  // frames them; everything else organizes organically around them.
  for (let k = 0; k < N_PRIM; k++) {
    nodes[k].x = PRIM_POS[k][0];
    nodes[k].y = PRIM_POS[k][1];
    nodes[k].fx = PRIM_POS[k][0];
    nodes[k].fy = PRIM_POS[k][1];
  }
  // Connected random tree over the hubs (primaries connect through it, not via
  // a forced triangle) ...
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

  // Reveal: the three primaries first (appear at 0), then everything else
  // streams in center-out at a steady cadence once the graph starts growing.
  // A small deterministic per-node jitter scatters the order so dots pop in
  // individually rather than as clean expanding rings.
  const rest = pos
    .map((p, i) => ({ i, d: Math.hypot(p.x, p.y) }))
    .filter((o) => o.i >= N_PRIM)
    .sort((a, b) => a.d - b.d);
  const appearAt = new Array<number>(pos.length).fill(0);
  rest.forEach(({ i }, rank) => {
    const u = rank / Math.max(1, rest.length - 1);
    const jitter = (fract(Math.sin(i * 12.9898) * 43758.5453) - 0.5) * 0.5;
    appearAt[i] = Math.max(GROW_START, GROW_START + GROW_DUR * u + jitter);
  });

  // 90th-percentile radius of the whole cloud, for the camera end fit.
  const dists = rest.map((o) => o.d).sort((a, b) => a - b);
  const fitEnd = dists[Math.floor(0.9 * (dists.length - 1))] + 30;

  return { pos, edges, appearAt, fitEnd, primLabels: PRIM_LABELS };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const GROW_START = 1.3; // three big labelled hubs sit alone until here
const GROW_DUR = 7.6; // the rest of the cloud streams in over this window
const GROW_END = GROW_START + GROW_DUR;
const PRIM_SHRINK_DUR = 3.5; // primaries reach their natural size early on
const FADE = [11.5, 12.7] as const; // hold, then fade + loop
const FIT_START = 150; // camera fit at intro (three big hubs + labels)
const R_BIG = 19; // primary hub radius at intro (shrinks to its natural r)

const LAYOUT = buildLayout();

export interface DrawRepositoryGraphOptions {
  /** Draw the frontend / backend / design-system hub labels (default true). */
  labels?: boolean;
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawRepositoryGraph(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear }: KernelFrame,
  opts?: DrawRepositoryGraphOptions,
) {
  const showLabels = opts?.labels !== false;
  const t = elapsed % CYCLE;
  const cycleFade = 1 - smoothstep(FADE[0], FADE[1], t);
  const A = appear * cycleFade;
  if (A <= 0.001) return;

  const { pos, edges, appearAt, fitEnd, primLabels } = LAYOUT;
  const half = Math.min(width, height) / 2;

  // Camera: a continuous, mild pull-back synced to the reveal. Zoom progress
  // is linear over the grow window and the scale is interpolated
  // exponentially, so the zoom-out rate stays steady while dots stream in.
  const grow = clamp01((t - GROW_START) / GROW_DUR);
  const startScale = (half * 0.82) / FIT_START;
  const endScale = (half * 0.92) / fitEnd;
  const scale =
    startScale * Math.pow(endScale / startScale, grow) * lerp(0.95, 1, appear);
  const rot = t * 0.012; // very subtle global rotation, incl. the hold
  const labelAlpha = showLabels ? 1 - smoothstep(1.8, 3.8, t) : 0;

  // Primary hub radius shrinks from R_BIG to its natural graph radius early,
  // so they settle into the cloud while the rest keeps streaming in.
  const primShrink = easeInOut(clamp01((t - GROW_START) / PRIM_SHRINK_DUR));
  const primR = (i: number) => lerp(R_BIG, pos[i].r, primShrink);

  const prog = (i: number) => clamp01((t - appearAt[i]) / 0.4);

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
    let ea = Math.min(pa, pb);
    // Keep the intro to just the three big dots: hold links between primaries
    // back until the graph begins to grow.
    if (e.a < N_PRIM && e.b < N_PRIM) {
      const gate = clamp01((t - GROW_START) / 1.0);
      if (gate <= 0) continue;
      ea *= gate;
    }
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

  // Faint accent halos under every hub.
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    if (p.kind !== 'hub') continue;
    const pp = prog(i);
    if (pp <= 0) continue;
    const r = i < N_PRIM ? primR(i) : p.r;
    ctx.globalAlpha = 0.08 * pp * A;
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 1)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Extra radial glow on the three primaries, strong while big.
  for (let i = 0; i < N_PRIM; i++) {
    const p = pos[i];
    const pp = prog(i);
    if (pp <= 0) continue;
    const gr = primR(i) * 2.8;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr);
    g.addColorStop(0, `rgba(${ACCENT_RGB}, ${0.3 * (1 - primShrink)})`);
    g.addColorStop(1, `rgba(${ACCENT_RGB}, 0)`);
    ctx.globalAlpha = pp * A;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nodes on top, popping in with a slight overshoot.
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    const pp = prog(i);
    if (pp <= 0) continue;
    const s = easeOutBack(pp);
    const r = p.kind === 'hub' && i < N_PRIM ? primR(i) : p.r;
    ctx.globalAlpha = clamp01(pp * 1.4) * A;
    ctx.fillStyle = p.kind === 'hub' ? ACCENT : OSS_COLOR;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, r * s), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Hub labels in screen space so they stay crisp at a fixed size.
  if (labelAlpha > 0.001) {
    const cosr = Math.cos(rot);
    const sinr = Math.sin(rot);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = LABEL_COLOR;
    for (let i = 0; i < N_PRIM; i++) {
      const p = pos[i];
      const rx = p.x * cosr - p.y * sinr;
      const ry = p.x * sinr + p.y * cosr;
      const sx = width / 2 + rx * scale;
      const sy = height / 2 + ry * scale;
      ctx.globalAlpha = labelAlpha * A;
      ctx.fillText(primLabels[i], sx, sy + primR(i) * scale + 8);
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}
