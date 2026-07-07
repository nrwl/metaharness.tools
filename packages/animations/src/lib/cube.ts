/**
 * Shared 3D wireframe-cube draw helper for the animation kernels.
 *
 * Pure module (no React). Ports the projection math and "transparent mode"
 * rendering from monorepo.tools' rotating-cube: back-to-front sorted filled
 * faces (optional), then all wireframe edges on top. Callers own the clock and
 * pass the Y-axis rotation angle per frame.
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export function rotateY(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos - p.z * sin,
    y: p.y,
    z: p.x * sin + p.z * cos,
  };
}

export function rotateX(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
  };
}

export function projectPoint(
  p: Point3D,
  cx: number,
  cy: number,
  perspective: number,
): { x: number; y: number } {
  const scale = perspective / (perspective + p.z);
  return {
    x: cx + p.x * scale,
    y: cy + p.y * scale,
  };
}

export function getCubeVertices(halfSize: number): Point3D[] {
  const s = halfSize;
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

export const CUBE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** Face vertex indices (quads). */
export const CUBE_FACES: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3], // front
  [4, 5, 6, 7], // back
  [0, 1, 5, 4], // top
  [2, 3, 7, 6], // bottom
  [0, 3, 7, 4], // left
  [1, 2, 6, 5], // right
];

export interface CubeOpts {
  cx: number;
  cy: number;
  /** Edge length in logical px. */
  size: number;
  /** Y-axis rotation in radians (caller owns the clock). */
  angle: number;
  tiltX?: number; // default 0.25 (slight top-down view)
  perspective?: number; // default 300
  stroke: string; // edge color
  edgeAlpha?: number; // default 0.65
  faceFill?: string; // face fill color; omit to skip fills
  faceFillAlpha?: number; // default 0.06
  /** Global multiplier applied to every alpha. */
  alpha?: number; // default 1
}

/**
 * Draws a single transparent wireframe cube: optional low-alpha filled faces
 * sorted back to front, then every edge on top. Saves/restores ctx state and
 * leaves globalAlpha at 1.
 */
export function drawCube(ctx: CanvasRenderingContext2D, opts: CubeOpts): void {
  const {
    cx,
    cy,
    size,
    angle,
    tiltX = 0.25,
    perspective = 300,
    stroke,
    edgeAlpha = 0.65,
    faceFill,
    faceFillAlpha = 0.06,
    alpha = 1,
  } = opts;

  // Spin on Y first (true vertical axis), then tilt for the viewing angle.
  const verts = getCubeVertices(size / 2).map((v) =>
    rotateX(rotateY(v, angle), tiltX),
  );
  const projected = verts.map((v) => projectPoint(v, cx, cy, perspective));

  ctx.save();

  // Depth cue: fade with distance so the near (top) geometry reads clearly
  // and the far side recedes, disambiguating the transparent wireframe.
  const zs = verts.map((v) => v.z);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const zRange = zMax - zMin || 1;
  const depthMul = (z: number) => 1 - ((z - zMin) / zRange) * 0.62;

  if (faceFill) {
    // Filled faces, back to front by average depth.
    const sorted = CUBE_FACES.map((face) => ({
      face,
      avgZ: face.reduce((s, vi) => s + verts[vi].z, 0) / face.length,
    })).sort((a, b) => b.avgZ - a.avgZ);

    ctx.fillStyle = faceFill;
    for (const { face, avgZ } of sorted) {
      ctx.globalAlpha = faceFillAlpha * alpha * depthMul(avgZ);
      ctx.beginPath();
      ctx.moveTo(projected[face[0]].x, projected[face[0]].y);
      for (let i = 1; i < face.length; i++) {
        ctx.lineTo(projected[face[i]].x, projected[face[i]].y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // All wireframe edges on top, near edges brighter than far ones.
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  for (const [a, b] of CUBE_EDGES) {
    ctx.globalAlpha =
      edgeAlpha * alpha * depthMul((verts[a].z + verts[b].z) / 2);
    ctx.beginPath();
    ctx.moveTo(projected[a].x, projected[a].y);
    ctx.lineTo(projected[b].x, projected[b].y);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
