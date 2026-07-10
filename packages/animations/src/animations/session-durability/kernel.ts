/**
 * SessionDurability scene kernel (pure canvas, no React).
 *
 * This is the reverse of the IsolatedSessions story. There, each teammate's
 * session bubble deflated into a small inert dot parked beside their laptop.
 * Here durability means those parked dots are captured back: every dot expands
 * out into its full session bubble (context graph + owner badge, tethered to
 * the laptop), then flies up and lands as an indexed row in a central session
 * store. Once the store is full the laptops fade, the store slides left, and a
 * Claude terminal (the DOM overlay) types "Resume the order cancellation
 * session" — at which point the matching stored row lights up and a copy of it
 * streaks across into the terminal, where the resume log takes over.
 *
 * The kernel owns everything spatial (laptops, session bubbles, the store card,
 * the resume streak). The terminal chrome + typed text live in the React
 * component so it can reuse the ported terminal primitives. Both are driven by
 * the same virtual-frame clock, so their timelines line up exactly.
 */
import {
  clamp01,
  easeInOut,
  easeOutBack,
  lerp,
  mulberry32,
  roundRectPath,
  smoothstep,
  type Pt,
} from '../../lib/anim';
import { DARK_PALETTE, type VizPalette } from '../../lib/palette';

// ---------------------------------------------------------------------------
// Stage — fixed logical canvas; the component scales it responsively.
// ---------------------------------------------------------------------------
export const STAGE_W = 960;
export const STAGE_H = 560;

/** Virtual frames per loop (authored at 30fps). */
export const CYCLE = 548;

// ---------------------------------------------------------------------------
// Palette — resolved from the shared semantic VizPalette so the scene re-themes
// with the site toggle. Dark values equal the animation's original hand-tuned
// colors, keeping dark mode pixel-identical.
// ---------------------------------------------------------------------------
interface Colors {
  accent: string;
  accentRgb: string;
  nodeTint: string;
  nodeTintRgb: string;
  fill: string;
  line: string;
  cardBg: string;
  cardBorder: string;
  textLabel: string;
  textHeader: string;
  textMuted: string;
}
function resolveColors(p: VizPalette): Colors {
  return {
    accent: p.accent, // #d4b483
    accentRgb: p.accentRgb, // 212, 180, 131
    nodeTint: p.accentSoft, // #e1cba8
    nodeTintRgb: p.nodeTintRgb, // 225, 203, 168
    fill: p.surface, // #171717
    line: p.line, // #404040
    // Warm near-black store card / border have no exact token; the raised
    // cardFill + outline keep them a distinct panel in both themes.
    cardBg: p.cardFill, // ~#141210 -> cardFill
    cardBorder: p.outline, // ~#2b2620 -> outline
    textLabel: p.textLabel, // #a3a3a3
    textHeader: p.textHeader, // #e5e5e5
    textMuted: p.textDim, // ~#6f6a62 -> textDim
  };
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const LAPTOP_Y = 500; // hinge baseline
const LAPTOP_X = [150, 370, 590, 810];
const DOCK_DX = 26; // parked-dot offset from laptop center
const DOT_R = 4.5;

const BUBBLE_R = 46;
const BUBBLE_Y = 330; // expanded bubble center, above the laptop row

const CARD_W = 300;
const CARD_H = 214;
const HEADER_H = 46;
const ROW_PAD = 6;
const ROW_H = 38;

/** Store card center in phase A (collecting) and phase B (resume). */
const STORE_A: Pt = { x: 480, y: 150 };
const STORE_B: Pt = { x: 176, y: 292 };

/** Where a resumed session lands inside the terminal overlay (stage coords). */
const TERM_CENTER: Pt = { x: 648, y: 212 };

interface StoreGeom {
  left: number;
  top: number;
  dotX: number;
  textX: number;
  rowY: (i: number) => number;
}
function storeGeom(c: Pt): StoreGeom {
  const left = c.x - CARD_W / 2;
  const top = c.y - CARD_H / 2;
  return {
    left,
    top,
    dotX: left + 28,
    textX: left + 46,
    rowY: (i) => top + HEADER_H + ROW_PAD + ROW_H / 2 + i * ROW_H,
  };
}

interface SessionDef {
  person: number;
  name: string;
  letter: string;
  title: string;
  id: string;
  /** The one the terminal resumes. */
  resume?: boolean;
}
const SESSIONS: SessionDef[] = [
  { person: 0, name: 'Maya', letter: 'M', title: 'impl-cancel-order', id: '568d33ca', resume: true },
  { person: 1, name: 'Leo', letter: 'L', title: 'add-webhooks', id: '1f9a02b7' },
  { person: 2, name: 'Noah', letter: 'N', title: 'migrate-auth', id: '77c3e410' },
  { person: 3, name: 'Elena', letter: 'E', title: 'fix-billing', id: '0b52d9af' },
];

// Inner context graph (matches the isolated-sessions look): 7 nodes in a disc.
const CTX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [0, 3], [3, 4], [2, 5], [4, 6], [5, 6], [1, 5],
];
const CTX_GRAPHS: Pt[][] = SESSIONS.map((_, i) => {
  const rnd = mulberry32(0x5e5 + i * 977);
  return Array.from({ length: 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.18 + rnd() * 0.62;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.86 };
  });
});

// ---------------------------------------------------------------------------
// Timeline (virtual frames @30fps)
// ---------------------------------------------------------------------------
const INTRO_END = 14;
// Each session's parked dot expands, holds, then flies into the store.
const EXP_START = [22, 48, 74, 100];
const EXPAND_DUR = 16;
const HOLD_END = 30; // local: expand done .. begin flight
const FLY_DUR = 24; // local: 30 .. 54 -> lands in store
const landFrame = (i: number) => EXP_START[i] + HOLD_END + FLY_DUR;

const SLIDE = [180, 206] as const; // store center -> left, laptops fade out
const ROW_LIGHT = 278; // resumed row highlights (submit lands ~272 in component)
const FLY2 = [288, 316] as const; // resumed session streaks into the terminal
const LOG_START = 320; // terminal resume log begins

// Resume log completes ~frame 434; hold the finished state a good while so it
// can be read before the loop fades and restarts.
const FADE = [520, 548] as const;

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
export function drawSessionDurability(
  ctx: CanvasRenderingContext2D,
  frame: number,
  palette: VizPalette = DARK_PALETTE,
) {
  const A =
    smoothstep(0, INTRO_END, frame) * (1 - smoothstep(FADE[0], FADE[1], frame));
  if (A <= 0.001) return;

  const col = resolveColors(palette);

  const slide = easeInOut(smoothstep(SLIDE[0], SLIDE[1], frame));
  const storePos: Pt = {
    x: lerp(STORE_A.x, STORE_B.x, slide),
    y: lerp(STORE_A.y, STORE_B.y, slide),
  };
  const laptopA = 1 - smoothstep(SLIDE[0], SLIDE[1], frame);

  drawLaptops(ctx, frame, A * laptopA, col);
  drawTethers(ctx, frame, A * laptopA, col);
  drawStore(ctx, frame, storePos, A, col);
  for (let i = 0; i < SESSIONS.length; i++) drawSession(ctx, i, frame, A * laptopA, col);
  drawResumeStreak(ctx, frame, storePos, A, col);

  ctx.globalAlpha = 1;
}

// ---- Laptops ---------------------------------------------------------------
function drawLaptops(ctx: CanvasRenderingContext2D, frame: number, A: number, col: Colors) {
  if (A <= 0.001) return;
  SESSIONS.forEach((s, i) => {
    const pop = smoothstep(0.4 + i * 3, 0.4 + i * 3 + 10, frame);
    if (pop <= 0.001) return;
    const sc = lerp(0.7, 1, easeInOut(pop));
    const x = LAPTOP_X[i];
    const by = LAPTOP_Y;

    ctx.save();
    ctx.globalAlpha = 0.9 * pop * A;
    ctx.lineWidth = 1;
    const sw = 46 * sc;
    const sh = 30 * sc;
    roundRectPath(ctx, x - sw / 2, by - sh, sw, sh, 3 * sc);
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = col.line;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - sw / 2 - 2 * sc, by);
    ctx.lineTo(x + sw / 2 + 2 * sc, by);
    ctx.lineTo(x + sw / 2 + 6 * sc, by + 4 * sc);
    ctx.lineTo(x - sw / 2 - 6 * sc, by + 4 * sc);
    ctx.closePath();
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = col.line;
    ctx.stroke();

    ctx.globalAlpha = pop * A;
    ctx.font = `13px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col.textLabel;
    ctx.fillText(s.name, x, by + 20);

    // Parked dot, before this session expands.
    if (frame < EXP_START[i]) {
      const dotFade = smoothstep(0.4 + i * 3 + 6, 0.4 + i * 3 + 16, frame);
      ctx.globalAlpha = dotFade * A;
      ctx.fillStyle = `rgba(${col.accentRgb}, 0.5)`;
      ctx.beginPath();
      ctx.arc(x + DOCK_DX, by - 4, DOT_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// ---- Session -> laptop tethers (only while the bubble is expanded/home) -----
function drawTethers(ctx: CanvasRenderingContext2D, frame: number, A: number, col: Colors) {
  if (A <= 0.001) return;
  SESSIONS.forEach((_, i) => {
    const st = sessionState(i, frame);
    const vis = st.expand * (1 - st.fly);
    if (vis <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = 0.5 * vis * A;
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(st.pos.x, st.pos.y + st.r + 3);
    ctx.lineTo(LAPTOP_X[i], LAPTOP_Y - 30);
    ctx.stroke();
    ctx.restore();
  });
}

// ---- Session bubble (expand from dock, hold, fly into the store) ------------
interface SessionState {
  active: boolean;
  expand: number;
  fly: number;
  pos: Pt;
  r: number;
}
function sessionState(i: number, frame: number): SessionState {
  const u = frame - EXP_START[i];
  const active = u >= 0 && frame < landFrame(i);
  const expand = smoothstep(0, EXPAND_DUR, u);
  const fly = smoothstep(HOLD_END, HOLD_END + FLY_DUR, u);

  const dock: Pt = { x: LAPTOP_X[i] + DOCK_DX, y: LAPTOP_Y - 4 };
  const home: Pt = { x: LAPTOP_X[i], y: BUBBLE_Y };
  const rise = easeInOut(expand);
  const homePos: Pt = { x: lerp(dock.x, home.x, rise), y: lerp(dock.y, home.y, rise) };

  const slot = storeGeom(STORE_A);
  const target: Pt = { x: slot.dotX, y: slot.rowY(i) };
  const fe = easeInOut(fly);
  const pos: Pt = { x: lerp(homePos.x, target.x, fe), y: lerp(homePos.y, target.y, fe) };

  const grown = lerp(DOT_R, BUBBLE_R, easeOutBack(clamp01(expand)));
  const r = lerp(grown, DOT_R, fe);
  return { active, expand, fly, pos, r };
}

function drawSession(ctx: CanvasRenderingContext2D, i: number, frame: number, A: number, col: Colors) {
  const st = sessionState(i, frame);
  if (!st.active || A <= 0.001) return;
  const s = SESSIONS[i];
  const bubble = st.expand * (1 - st.fly); // graph/halo strength
  const { x, y } = st.pos;
  const r = st.r;

  ctx.save();

  // Halo
  if (bubble > 0.01) {
    ctx.globalAlpha = A * bubble;
    ctx.fillStyle = `rgba(${col.accentRgb}, 0.07)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${col.accentRgb}, 0.05)`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${col.accentRgb}, 0.18)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Travelling husk / landed dot: solid as the bubble collapses in flight.
  const solid = st.fly;
  if (solid > 0.01) {
    ctx.globalAlpha = A * solid;
    ctx.fillStyle = `rgba(${col.accentRgb}, 0.85)`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(DOT_R, r), 0, Math.PI * 2);
    ctx.fill();
  }

  // Context graph inside the halo (build with the expand, gone once flying).
  if (bubble > 0.01) {
    const nodeR = r * 0.78;
    const pts = CTX_GRAPHS[i].map((p) => ({ x: x + p.x * nodeR, y: y + p.y * nodeR }));
    const E = CTX_EDGES.length;
    CTX_EDGES.forEach(([a, b], k) => {
      const er = smoothstep(k / E, k / E + 0.3, st.expand);
      if (er <= 0.01) return;
      ctx.globalAlpha = A * bubble * er;
      ctx.strokeStyle = `rgba(${col.nodeTintRgb}, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    });
    pts.forEach((p, j) => {
      const nr = smoothstep((j / 7) * 0.8, (j / 7) * 0.8 + 0.2, st.expand);
      if (nr <= 0.01) return;
      ctx.globalAlpha = A * bubble * nr;
      ctx.fillStyle = col.nodeTint;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Owner badge, top-left of the bubble.
    const bx = x - r * 0.78;
    const byy = y - r * 0.78;
    const br = 8.5;
    ctx.globalAlpha = A * bubble;
    ctx.fillStyle = col.fill;
    ctx.beginPath();
    ctx.arc(bx, byy, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${col.accentRgb}, 0.6)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col.textHeader;
    ctx.fillText(s.letter, bx, byy + 0.5);
  }

  ctx.restore();
}

// ---- Session store card ----------------------------------------------------
function drawStore(ctx: CanvasRenderingContext2D, frame: number, c: Pt, A: number, col: Colors) {
  const appear = smoothstep(2, 16, frame);
  if (appear <= 0.001) return;
  const g = storeGeom(c);

  ctx.save();
  ctx.globalAlpha = appear * A;

  // Card
  roundRectPath(ctx, g.left, g.top, CARD_W, CARD_H, 12);
  ctx.fillStyle = col.cardBg;
  ctx.fill();
  ctx.strokeStyle = col.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `600 13px ${MONO}`;
  ctx.fillStyle = col.textHeader;
  ctx.fillText('Session store', g.left + 20, g.top + HEADER_H / 2);
  ctx.textAlign = 'right';
  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = col.textMuted;
  const filled = SESSIONS.filter((_, i) => frame >= landFrame(i)).length;
  ctx.fillText(`${filled} indexed`, g.left + CARD_W - 20, g.top + HEADER_H / 2);
  ctx.strokeStyle = col.cardBorder;
  ctx.beginPath();
  ctx.moveTo(g.left, g.top + HEADER_H);
  ctx.lineTo(g.left + CARD_W, g.top + HEADER_H);
  ctx.stroke();

  // Rows
  SESSIONS.forEach((s, i) => {
    const y = g.rowY(i);
    const land = landFrame(i);
    const fill = smoothstep(land, land + 8, frame);

    // Resumed row highlight.
    if (s.resume) {
      const lit = smoothstep(ROW_LIGHT, ROW_LIGHT + 12, frame);
      if (lit > 0.01) {
        ctx.globalAlpha = appear * A * lit;
        roundRectPath(ctx, g.left + 8, y - ROW_H / 2 + 3, CARD_W - 16, ROW_H - 6, 6);
        ctx.fillStyle = `rgba(${col.accentRgb}, 0.1)`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${col.accentRgb}, 0.4)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (fill <= 0.01) {
      // Empty placeholder slot.
      ctx.globalAlpha = appear * A * 0.5;
      ctx.strokeStyle = `rgba(${col.accentRgb}, 0.2)`;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(g.dotX, y, DOT_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    ctx.globalAlpha = appear * A * fill;
    ctx.fillStyle = col.accent;
    ctx.beginPath();
    ctx.arc(g.dotX, y, DOT_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = col.textHeader;
    ctx.fillText(s.title, g.textX, y - 6);
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = col.textMuted;
    ctx.fillText(`${s.name.toLowerCase()} · ${s.id}`, g.textX, y + 8);
  });

  ctx.restore();
}

// ---- Resume streak: stored session -> terminal center ----------------------
function drawResumeStreak(ctx: CanvasRenderingContext2D, frame: number, storePos: Pt, A: number, col: Colors) {
  if (frame < FLY2[0]) return;
  const idx = SESSIONS.findIndex((s) => s.resume);
  const g = storeGeom(storePos);
  const origin: Pt = { x: g.dotX, y: g.rowY(idx) };
  const f = smoothstep(FLY2[0], FLY2[1], frame);
  const fe = easeInOut(f);
  const pos: Pt = {
    x: lerp(origin.x, TERM_CENTER.x, fe),
    y: lerp(origin.y, TERM_CENTER.y, fe),
  };

  ctx.save();

  // Faint trail behind the travelling dot.
  if (f > 0.02 && f < 0.99) {
    ctx.globalAlpha = A * 0.25 * (1 - f);
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Landed session pulses, then dissolves as the resume log begins.
  const landFade = 1 - smoothstep(LOG_START, LOG_START + 12, frame);
  const arrive = smoothstep(FLY2[1] - 6, FLY2[1], frame);
  const r = lerp(4.5, 8, arrive);

  if (arrive > 0.01 && landFade > 0.01) {
    const pulse = 1 + 0.5 * Math.sin(frame * 0.5);
    ctx.globalAlpha = A * landFade * 0.5 * arrive;
    ctx.fillStyle = `rgba(${col.accentRgb}, 0.18)`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = A * Math.max(landFade, 1 - arrive);
  ctx.fillStyle = col.accent;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
