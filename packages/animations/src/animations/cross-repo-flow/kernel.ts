/**
 * CrossRepoFlow draw kernel (pure, no React).
 *
 * A before/after morph of five repositories in a hub topology (frontend on top,
 * a gateway hub in the middle, products / auth / orders fanning out):
 *
 *  - BEFORE (progress 0): each repo is an opaque dark wireframe cage with a
 *    single agent dot trapped inside and faint "manual chore" labels (git
 *    clone / branch / worktree) beside it. No edges connect the repos — every
 *    agent works one repo in isolation.
 *  - AFTER (progress 1): the cages turn transparent, the wireframes crossfade
 *    gray -> accent, tiny internal source-graph nodes fade in, directed
 *    cross-repo edges draw on (with arrowheads + travelling pulses), the caged
 *    agents' halos grow as their vision extends, and ONE roaming agent with a
 *    comet trail traverses the whole graph through the hub.
 *
 * Continuous motion (cube rotation, pulses, roam) reads `elapsed`; the morph is
 * driven entirely by `progress`, so the caller owns the tween. Ported in spirit
 * from Juri's Remotion `polygraph-repo-islands` clip, re-authored for canvas 2D
 * and the metaharness.tools site palette (accent, not amber).
 */
import { clamp01, easeInOut, lerp, type MorphFrame } from '../../lib/anim';

// ---------------------------------------------------------------------------
// Palette (site dark theme)
// ---------------------------------------------------------------------------
const ACCENT = '#d4b483';
const ACCENT_HI = '#e1cba8'; // accent mixed toward white, for source cores
const EDGE_GRAY = '#525252';
const EDGE_GRAY_RGB = '82, 82, 82';
const FILL = '#171717';
const TEXT_LABEL = '#a3a3a3';
const TEXT_DIM = '#737373';
const ROAM_CORE = '#e5e5e5';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout, authored on a 960x600 logical canvas.
// ---------------------------------------------------------------------------
const BASE_W = 960;
const BASE_H = 600;

interface RepoNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Outer cube edge length (px). */
  size: number;
  /** Phase offset so cubes don't rotate in lockstep. */
  angleOffset: number;
  /** Manual-chore labels shown (faintly) around the caged repo in BEFORE. */
  chores: string[];
}

const REPOS: ReadonlyArray<RepoNode> = [
  { id: 'frontend', label: 'frontend', x: 480, y: 120, size: 78, angleOffset: 0, chores: ['git clone', 'branch'] },
  { id: 'gateway', label: 'gateway', x: 480, y: 292, size: 92, angleOffset: 1.2, chores: ['worktree', 'rebase'] },
  { id: 'products', label: 'products', x: 236, y: 452, size: 74, angleOffset: 2.4, chores: ['git clone', 'link'] },
  { id: 'auth', label: 'auth', x: 480, y: 468, size: 70, angleOffset: 3.5, chores: ['branch', 'pin dep'] },
  { id: 'orders', label: 'orders', x: 724, y: 452, size: 74, angleOffset: 4.7, chores: ['git clone', 'worktree'] },
];

// Directed edges (source -> target), indices into REPOS. Hub topology.
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // frontend -> gateway
  [1, 2], // gateway -> products
  [1, 3], // gateway -> auth
  [1, 4], // gateway -> orders
];

// Roaming-agent walk over the graph (traverses the gateway hub to stay on real
// edges): frontend -> gateway -> products -> gateway -> auth -> ... loop.
const ROAM_PATH = [0, 1, 2, 1, 3, 1, 4, 1] as const;

// ---------------------------------------------------------------------------
// Motion constants (per second; the source clip's per-frame values * 30fps).
// ---------------------------------------------------------------------------
const ROT_SPEED = 0.39; // rad/s (~0.013 rad/frame)
const PULSE_SPEED = 0.36; // cross-edge pulse cycles/s
const ROAM_SEG = 0.867; // seconds per roam segment (~26 frames)

// ---------------------------------------------------------------------------
// Cube geometry (pure 3D projection). Perspective is large so foreshortening
// stays gentle; a fixed X tilt looks slightly down onto the top face.
// ---------------------------------------------------------------------------
const PERSPECTIVE = 900;
const TILT_X = 0.32;

interface P3 {
  x: number;
  y: number;
  z: number;
}
interface P2 {
  x: number;
  y: number;
}

function orient(p: P3, angleY: number): P3 {
  // rotateY then rotateX(TILT_X).
  const cy = Math.cos(angleY);
  const sy = Math.sin(angleY);
  const rx = p.x * cy - p.z * sy;
  const rz = p.x * sy + p.z * cy;
  const cx = Math.cos(TILT_X);
  const sx = Math.sin(TILT_X);
  return { x: rx, y: p.y * cx - rz * sx, z: p.y * sx + rz * cx };
}

function project(p: P3, cx: number, cy: number, angleY: number): P2 {
  const o = orient(p, angleY);
  const s = PERSPECTIVE / (PERSPECTIVE + o.z);
  return { x: cx + o.x * s, y: cy + o.y * s };
}

function cubeVertices(half: number): P3[] {
  const s = half;
  return [
    { x: -s, y: -s, z: -s },
    { x: s, y: -s, z: -s },
    { x: s, y: s, z: -s },
    { x: -s, y: s, z: -s },
    { x: -s, y: -s, z: s },
    { x: s, y: -s, z: s },
    { x: s, y: s, z: s },
    { x: -s, y: s, z: s },
  ];
}

const CUBE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const CUBE_FACES: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 3, 7, 4],
  [1, 2, 6, 5],
];

// Inner "source" nodes (unit cube) + a tiny internal graph, visible once the
// cage turns transparent (the agent can finally see inside its own repo).
const SRC_NODES: ReadonlyArray<P3> = [
  { x: -0.5, y: -0.42, z: 0.3 },
  { x: 0.45, y: -0.18, z: -0.4 },
  { x: 0.12, y: 0.5, z: 0.18 },
  { x: -0.35, y: 0.28, z: -0.32 },
  { x: 0.5, y: 0.4, z: 0.42 },
];
const SRC_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [0, 4], [2, 4],
];

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
export function drawCrossRepoFlow(
  ctx: CanvasRenderingContext2D,
  { width, height, elapsed, appear, progress }: MorphFrame,
) {
  const A = appear;
  if (A <= 0.001) return;
  const p = clamp01(progress);

  const fit = Math.min(width / BASE_W, height / BASE_H);
  const sc = fit * lerp(0.92, 1, appear);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(sc, sc);
  ctx.translate(-BASE_W / 2, -BASE_H / 2);

  // Cross-repo edges live behind the cubes.
  drawCrossEdges(ctx, p, elapsed, A);

  // Cubes back-to-front by y so nearer (lower) repos overlap correctly.
  const order = REPOS.map((_, i) => i).sort((a, b) => REPOS[a].y - REPOS[b].y);
  for (const i of order) drawCube(ctx, REPOS[i], p, elapsed, A);

  // One roaming agent traversing the whole graph, on top of everything.
  drawRoamingAgent(ctx, p, elapsed, A);

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- A single repo cube ----------------------------------------------------
function drawCube(
  ctx: CanvasRenderingContext2D,
  repo: RepoNode,
  p: number,
  elapsed: number,
  A: number,
) {
  const half = repo.size / 2;
  const angleY = elapsed * ROT_SPEED + repo.angleOffset;
  // Gentle idle float, kept tiny so it doesn't fight the rotation.
  const ox = repo.x + Math.sin(elapsed * 0.9 + repo.angleOffset) * 3;
  const oy = repo.y + Math.cos(elapsed * 0.75 + repo.angleOffset * 1.3) * 3;

  const model = cubeVertices(half);
  const verts = model.map((v) => project(v, ox, oy, angleY));

  // isolated -> connected treatments.
  const faceOpacity = lerp(0.82, 0.06, p);
  const grayEdge = 0.55 * (1 - 0.75 * p);
  const amberEdge = 0.85 * p;
  const caged = 1 - clamp01(p / 0.5); // caged-agent caption fade-out

  // Faint manual-chore labels around the caged repo (BEFORE only).
  if (caged > 0.01) {
    ctx.save();
    ctx.globalAlpha = caged * 0.5 * A;
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_DIM;
    repo.chores.forEach((c, k) => {
      ctx.fillText(c, repo.x + half + 12, repo.y - 8 + k * 14);
    });
    ctx.restore();
  }

  // Translucent faces, painter-sorted back-to-front by oriented depth.
  const faceOrder = CUBE_FACES.map((face, i) => ({
    i,
    z:
      face.reduce((s, vi) => s + orient(model[vi], angleY).z, 0) / face.length,
  })).sort((a, b) => b.z - a.z);
  ctx.save();
  ctx.fillStyle = FILL;
  for (const { i } of faceOrder) {
    ctx.globalAlpha = faceOpacity * A;
    tracePoly(ctx, CUBE_FACES[i].map((vi) => verts[vi]));
    ctx.fill();
  }
  ctx.restore();

  // Wireframe: gray boundary crossfading to accent as it connects.
  ctx.save();
  ctx.lineWidth = 1.2;
  for (const [a, b] of CUBE_EDGES) {
    ctx.globalAlpha = grayEdge * A;
    ctx.strokeStyle = EDGE_GRAY;
    ctx.beginPath();
    ctx.moveTo(verts[a].x, verts[a].y);
    ctx.lineTo(verts[b].x, verts[b].y);
    ctx.stroke();
  }
  if (amberEdge > 0.01) {
    ctx.strokeStyle = ACCENT;
    for (const [a, b] of CUBE_EDGES) {
      ctx.globalAlpha = amberEdge * A;
      ctx.beginPath();
      ctx.moveTo(verts[a].x, verts[a].y);
      ctx.lineTo(verts[b].x, verts[b].y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Inner source graph (fades in once the cage is see-through).
  if (p > 0.01) {
    const srcPts = SRC_NODES.map((n) =>
      project(
        { x: n.x * half * 0.62, y: n.y * half * 0.62, z: n.z * half * 0.62 },
        ox,
        oy,
        angleY,
      ),
    );
    ctx.save();
    ctx.globalAlpha = p * A;
    ctx.strokeStyle = `rgba(${EDGE_GRAY_RGB}, 0.5)`;
    ctx.lineWidth = 1;
    for (const [a, b] of SRC_EDGES) {
      ctx.beginPath();
      ctx.moveTo(srcPts[a].x, srcPts[a].y);
      ctx.lineTo(srcPts[b].x, srcPts[b].y);
      ctx.stroke();
    }
    srcPts.forEach((pt, i) => {
      ctx.globalAlpha = p * A * (i === 0 ? 0.95 : 0.8);
      ctx.fillStyle = i === 0 ? ACCENT_HI : EDGE_GRAY;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, i === 0 ? 2.8 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // The repo's agent: trapped dot (BEFORE) whose halo grows as vision extends.
  const agentPulse = 0.6 + 0.4 * Math.sin(elapsed * 3.6 + repo.angleOffset);
  const haloR = lerp(13, 22, p) * (0.85 + 0.15 * agentPulse);
  ctx.save();
  ctx.fillStyle = ACCENT;
  ctx.globalAlpha = (0.1 + 0.08 * p) * A;
  ctx.beginPath();
  ctx.arc(ox, oy, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.14 * A;
  ctx.beginPath();
  ctx.arc(ox, oy, haloR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = A;
  ctx.beginPath();
  ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Caged-agent caption, present while caged.
  if (caged > 0.01) {
    ctx.save();
    ctx.globalAlpha = caged * 0.9 * A;
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ACCENT;
    ctx.fillText('agent', ox, oy + 15);
    ctx.restore();
  }

  // Repo name label below the cube.
  ctx.save();
  ctx.globalAlpha = 0.82 * A;
  ctx.font = `12px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_LABEL;
  ctx.fillText(repo.label, repo.x, repo.y + half + 24);
  ctx.restore();
}

// ---- Cross-repo edges + arrowheads + vision pulses -------------------------
function drawCrossEdges(
  ctx: CanvasRenderingContext2D,
  p: number,
  elapsed: number,
  A: number,
) {
  const reveal = clamp01((p - 0.25) / 0.75);
  if (reveal <= 0.01) return;

  EDGES.forEach(([ai, bi], ei) => {
    const a = REPOS[ai];
    const b = REPOS[bi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const startX = a.x + ux * (a.size / 2 + 4);
    const startY = a.y + uy * (a.size / 2 + 4);
    const tipX = b.x - ux * (b.size / 2 + 8);
    const tipY = b.y - uy * (b.size / 2 + 8);
    // Draw-on: the edge extends from its start toward the tip.
    const ex = lerp(startX, tipX, reveal);
    const ey = lerp(startY, tipY, reveal);

    ctx.save();
    ctx.globalAlpha = reveal * A;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead once the edge has essentially reached the target.
    if (reveal > 0.92) {
      const ah = 8;
      const perpX = -uy;
      const perpY = ux;
      const baseX = tipX - ux * ah;
      const baseY = tipY - uy * ah;
      ctx.globalAlpha = ((reveal - 0.92) / 0.08) * A;
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX + perpX * 3.5, baseY + perpY * 3.5);
      ctx.lineTo(baseX - perpX * 3.5, baseY - perpY * 3.5);
      ctx.closePath();
      ctx.fill();
    }

    // Vision pulses travelling source -> target (sine end-fade).
    for (let k = 0; k < 3; k++) {
      const t = (elapsed * PULSE_SPEED + k / 3 + ei * 0.17) % 1;
      if (t > reveal) continue;
      const px = lerp(startX, tipX, t);
      const py = lerp(startY, tipY, t);
      const fade =
        t < 0.12 ? t / 0.12 : t > 0.85 ? (1 - t) / 0.15 : 1;
      ctx.globalAlpha = clamp01(fade) * 0.9 * reveal * A;
      ctx.fillStyle = ACCENT_HI;
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// ---- One roaming agent traversing the whole graph --------------------------
function drawRoamingAgent(
  ctx: CanvasRenderingContext2D,
  p: number,
  elapsed: number,
  A: number,
) {
  const appear = clamp01((p - 0.6) / 0.4);
  if (appear <= 0.01) return;

  const total = elapsed / ROAM_SEG;
  const seg = Math.floor(total) % ROAM_PATH.length;
  const localRaw = total - Math.floor(total);
  const localT = easeInOut(localRaw);

  const a = REPOS[ROAM_PATH[seg]];
  const b = REPOS[ROAM_PATH[(seg + 1) % ROAM_PATH.length]];
  const x = lerp(a.x, b.x, localT);
  const y = lerp(a.y, b.y, localT);

  ctx.save();
  // Comet trail: a few samples back along the current segment.
  [0.06, 0.12, 0.18].forEach((d, i) => {
    const tt = Math.max(0, localT - d);
    const tx = lerp(a.x, b.x, tt);
    const ty = lerp(a.y, b.y, tt);
    ctx.globalAlpha = (1 - d * 4) * 0.4 * appear * A;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(tx, ty, 5 - i * 1.2, 0, Math.PI * 2);
    ctx.fill();
  });
  // Roaming agent: halo + core.
  ctx.globalAlpha = 0.12 * appear * A;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.18 * appear * A;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = appear * A;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ROAM_CORE;
  ctx.beginPath();
  ctx.arc(x, y, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: P2[]) {
  ctx.beginPath();
  pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
}
