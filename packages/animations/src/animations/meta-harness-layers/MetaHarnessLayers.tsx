import { useEffect, useRef, type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';
import { drawSessionNetwork } from '../session-network/kernel';
import { drawRepositoryGraph } from '../repository-graph/kernel';

/**
 * MetaHarnessLayers
 *
 * A staged, self-running canvas visualization of the LLM -> harness ->
 * meta-harness layering from Victor Savkin's "From Framework Wars to AI
 * Metaharnesses" talk.
 *
 * The diagram is a concentric architecture built up in three timed stages,
 * held with gentle idle motion, then faded back to the bare LLM and looped:
 *
 *  - Center: the LLM node (the thing that just predicts the next token).
 *  - Middle: the harness (Claude Code / Codex) that feeds the LLM a system
 *    prompt, skills and MCP tools.
 *  - Outer: the meta-harness, whose signature idea is *reification*: objects a
 *    harness leaves un-reified (Organizations, Users, Sessions, Repositories,
 *    Code changes, Memories) start as dashed chips and solidify one by one,
 *    becoming first-class.
 *
 * Layout is data-first (see {@link HARNESS_CHIPS} / {@link META_CHIPS}) and
 * drawing is split into per-layer functions so pieces can later be extracted
 * as reusable components.
 *
 * Interactivity: once reified, the "Sessions" and "Repositories" chips are
 * clickable — the core diagram recedes and an in-context panel opens in the
 * middle of the meta-harness, running the corresponding network kernel
 * (SessionNetwork / RepositoryGraph). Esc, clicking the chip again, or
 * clicking outside the panel closes it.
 */
export interface MetaHarnessLayersProps {
  /** Forwarded to the wrapper element. */
  className?: string;
  /** Freeze on a single static frame. */
  paused?: boolean;
  /**
   * 'full' (default) is the complete diagram described above. 'simple' is a
   * reduced cut for an earlier page section: just the layering (compact empty
   * harness rect + meta-harness with reifying chips), no LLM, no harness
   * chips/pulses, and no interactivity.
   */
  variant?: 'full' | 'simple';
  /**
   * 'auto' (default) cycles the build-up stages on a timer. Passing 0, 1 or 2
   * pins that stage fully settled (no build-in replay) while idle motion keeps
   * running — intended for later scroll-driven use.
   */
  stage?: 'auto' | 0 | 1 | 2;
  /** Logical drawing width in CSS pixels. */
  width?: number;
  /** Logical drawing height in CSS pixels. */
  height?: number;
  style?: CSSProperties;
}

// ---------------------------------------------------------------------------
// Palette (site dark theme). Accent is reserved for "alive" signals only:
// the feed pulses travelling into the LLM, the reify flash, the meta layer's
// post-reify breathing, and hover/expand affordances on the clickable chips.
// ---------------------------------------------------------------------------
const BG = '#0a0a0a';
const FILL = '#171717';
const OUTLINE_META_C: RGB = [38, 38, 38]; // #262626, breathes toward ACCENT
const OUTLINE_HARNESS = '#404040';
const OUTLINE_LLM = '#262626'; // deliberately quiet — emphasis sits on the meta layer
const TEXT_LABEL = '#a3a3a3';
const TEXT_HEADER = '#e5e5e5';
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';

const FONT_LABEL = "12px ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_HEADER =
  "600 13px ui-sans-serif, system-ui, -apple-system, sans-serif";
const FONT_SUB = "11px ui-sans-serif, system-ui, -apple-system, sans-serif";

// ---------------------------------------------------------------------------
// Brand marks rendered inside the LLM node. Single-path icons from Simple
// Icons (simpleicons.org), both authored on a 24x24 viewBox; drawn via Path2D
// with translate(iconTopLeft) + scale(size / 24).
// ---------------------------------------------------------------------------
const CLAUDE_ICON_PATH =
  'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z';

const OPENAI_ICON_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

// Path2D objects are created lazily (and cached at module scope) so importing
// this file in a non-DOM environment (SSR, node-side tooling) does not throw.
let iconPaths: { claude: Path2D; openai: Path2D } | null = null;
function getIconPaths() {
  if (!iconPaths && typeof Path2D !== 'undefined') {
    iconPaths = {
      claude: new Path2D(CLAUDE_ICON_PATH),
      openai: new Path2D(OPENAI_ICON_PATH),
    };
  }
  return iconPaths;
}

// ---------------------------------------------------------------------------
// Layout — all positions are offsets from the canvas center so the whole
// diagram scales cleanly from the middle.
// ---------------------------------------------------------------------------
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 600;

const LLM = { w: 122, h: 96 };
const HARNESS_RECT = { w: 476, h: 332 };
// Compact harness rect for the 'simple' variant: the layer is empty inside
// (no LLM, no harness chips), so the full footprint would read as dead space.
const HARNESS_RECT_SIMPLE = { w: 320, h: 180 };
const META_RECT = { w: 876, h: 556 };
const HARNESS_CHIP = { w: 116, h: 34 };
const META_CHIP = { w: 128, h: 36 };

interface ChipDef {
  id: string;
  label: string;
  /** Center offset from canvas center. */
  x: number;
  y: number;
  /** Stable per-element seed driving its idle drift and pulse phase. */
  seed: number;
}

// Harness inputs — each feeds the LLM via a connector with a pulse travelling
// inward.
const HARNESS_CHIPS: ChipDef[] = [
  { id: 'system-prompt', label: 'System prompt', x: -170, y: -6, seed: 0.11 },
  { id: 'skills', label: 'Skills', x: 170, y: -6, seed: 0.53 },
  { id: 'mcp-tools', label: 'MCP tools', x: 0, y: 106, seed: 0.82 },
];

// Meta-harness objects — the un-reified chips that solidify one by one. Order
// here is the reify order (staggered).
const META_CHIPS: ChipDef[] = [
  { id: 'organizations', label: 'Organizations', x: -152, y: -232, seed: 0.17 },
  { id: 'users', label: 'Users', x: 152, y: -232, seed: 0.41 },
  { id: 'sessions', label: 'Sessions', x: -338, y: -44, seed: 0.63 },
  { id: 'repositories', label: 'Repositories', x: 338, y: -44, seed: 0.29 },
  { id: 'code-changes', label: 'Code changes', x: -152, y: 232, seed: 0.74 },
  { id: 'memories', label: 'Memories', x: 152, y: 232, seed: 0.91 },
];

// ---------------------------------------------------------------------------
// Timeline (seconds within one auto cycle). Eased throughout — no linear pops.
// ---------------------------------------------------------------------------
const CYCLE = 16;
const T = {
  llmFadeIn: [0, 0.7] as const, // driven by global elapsed, once
  harnessRect: [2.5, 4.2] as const,
  harnessChips: [3.2, 4.9] as const,
  metaRect: [6.0, 7.6] as const,
  metaChips: [6.7, 8.3] as const,
  reifyStart: 8.5, // first chip solidifies here
  reifyStagger: 0.42, // per-chip delay
  reifyDur: 0.6, // dashed -> solid transition length
  fadeOut: [14.5, 16.0] as const, // everything but the LLM fades away
};

// Compressed timeline for the 'simple' variant: no LLM or harness-chip beats,
// so the build-up starts almost immediately and the cycle is shorter.
const CYCLE_SIMPLE = 14;
const T_SIMPLE = {
  harnessRect: [0.3, 1.7] as const,
  metaRect: [2.2, 3.8] as const,
  metaChips: [2.9, 4.5] as const,
  reifyStart: 5.0, // first chip solidifies here
  reifyStagger: 0.42, // per-chip delay
  reifyDur: 0.6, // dashed -> solid transition length
  fadeOut: [12.5, 14.0] as const, // everything fades away
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Smooth (eased) 0->1 ramp between edges a and b. */
function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Cubic ease in/out over an already-normalized 0..1 value. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type RGB = readonly [number, number, number];
const ACCENT_C: RGB = [212, 180, 131];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const rgbCss = (c: RGB) =>
  `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

interface Pt {
  x: number;
  y: number;
}

/**
 * Point where a ray from a rect's center toward `target` crosses the rect
 * boundary. Used to anchor connectors to the edges of nodes/layers.
 */
function rectEdge(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  target: Pt,
): Pt {
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Idle drift for an element: a small, per-seed Lissajous wobble. */
function drift(seed: number, elapsed: number, amp = 2.4): Pt {
  const fx = 0.5 + seed * 0.6;
  const fy = 0.42 + seed * 0.45;
  return {
    x: amp * Math.sin(elapsed * fx + seed * 6.283),
    y: amp * Math.cos(elapsed * fy + seed * 4.1),
  };
}

// ---------------------------------------------------------------------------
// Click-to-expand in-context panel
// ---------------------------------------------------------------------------
type ExpandMode = 'sessions' | 'repositories';

interface ExpandState {
  /** Which network is (or was last) shown; null once fully closed. */
  mode: ExpandMode | null;
  /** Desired direction: true -> expanding/expanded, false -> closing/closed. */
  open: boolean;
  /** Raw transition progress 0..1 (eased where used). */
  t: number;
  /** `elapsed` at click time, so the kernel runs a fresh local clock. */
  kernelStart: number;
}

interface HitRect {
  id: ExpandMode;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CLICKABLE_CHIPS: ReadonlySet<string> = new Set([
  'sessions',
  'repositories',
]);
const EXPAND_DUR = 0.6; // seconds for the panel open/close transition
const HOVER_DUR = 0.15; // seconds for the chip hover ease
// In-context panel the network kernels render into (centered on the canvas).
const PANEL = { w: 496, h: 384, r: 10, fill: '#111111', border: '#404040' };
const PANEL_SMALL = { w: 520, h: 370 }; // fallback if chips would overlap

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

/**
 * Global fade multiplier applied by {@link ga} to every alpha in the layered
 * diagram, so the whole diagram fades as one unit during the click-to-explode
 * transition without threading a multiplier through every draw function.
 * Always reset to 1 after the diagram is drawn.
 */
let fadeMul = 1;
function ga(ctx: CanvasRenderingContext2D, v: number) {
  ctx.globalAlpha = v * fadeMul;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * A layer outline (harness / meta-harness) with an eased fade + slight
 * scale-up build-in. `appear` 0..1 drives both alpha and scale.
 */
function drawLayer(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  w: number,
  h: number,
  radius: number,
  stroke: string,
  appear: number,
  header: string,
) {
  if (appear <= 0.001) return;
  const eased = easeInOut(appear);
  const scale = lerp(0.965, 1, eased);
  ctx.save();
  ga(ctx, eased);
  ctx.translate(center.x, center.y);
  ctx.scale(scale, scale);
  ctx.translate(-center.x, -center.y);

  const x = center.x - w / 2;
  const y = center.y - h / 2;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = FILL;
  ga(ctx, eased * 0.55);
  ctx.fill();
  ga(ctx, eased);
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  // Header, top-left inside the layer.
  ctx.font = FONT_HEADER;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_HEADER;
  ctx.fillText(header, x + 16, y + 18);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stage state
// ---------------------------------------------------------------------------
interface StageState {
  harnessRect: number; // 0..1 appear
  harnessChips: number; // 0..1 appear
  metaRect: number; // 0..1 appear
  metaChips: number; // 0..1 appear (dashed in)
  /** Per meta-chip reify progress, index-aligned with META_CHIPS. */
  reify: number[];
  /** Per meta-chip accent flash intensity, index-aligned with META_CHIPS. */
  flash: number[];
}

function autoState(pt: number): StageState {
  const fadeOut = smoothstep(T.fadeOut[0], T.fadeOut[1], pt);
  const alive = 1 - fadeOut;

  const harnessRect = smoothstep(T.harnessRect[0], T.harnessRect[1], pt) * alive;
  const harnessChips =
    smoothstep(T.harnessChips[0], T.harnessChips[1], pt) * alive;
  const metaRect = smoothstep(T.metaRect[0], T.metaRect[1], pt) * alive;
  const metaChips = smoothstep(T.metaChips[0], T.metaChips[1], pt) * alive;

  const reify: number[] = [];
  const flash: number[] = [];
  for (let i = 0; i < META_CHIPS.length; i++) {
    const s = T.reifyStart + i * T.reifyStagger;
    reify.push(smoothstep(s, s + T.reifyDur, pt));
    // Triangle flash peaking just after the chip solidifies.
    const u = pt - s;
    const f = u >= 0 && u < 0.5 ? 1 - Math.abs(u - 0.15) / 0.35 : 0;
    flash.push(Math.max(0, f) * alive);
  }
  return { harnessRect, harnessChips, metaRect, metaChips, reify, flash };
}

// Same shape as autoState but driven by the compressed T_SIMPLE beats; the
// harness-chip channel is pinned to 0 since 'simple' never draws them.
function autoStateSimple(pt: number): StageState {
  const fadeOut = smoothstep(T_SIMPLE.fadeOut[0], T_SIMPLE.fadeOut[1], pt);
  const alive = 1 - fadeOut;

  const harnessRect =
    smoothstep(T_SIMPLE.harnessRect[0], T_SIMPLE.harnessRect[1], pt) * alive;
  const metaRect =
    smoothstep(T_SIMPLE.metaRect[0], T_SIMPLE.metaRect[1], pt) * alive;
  const metaChips =
    smoothstep(T_SIMPLE.metaChips[0], T_SIMPLE.metaChips[1], pt) * alive;

  const reify: number[] = [];
  const flash: number[] = [];
  for (let i = 0; i < META_CHIPS.length; i++) {
    const s = T_SIMPLE.reifyStart + i * T_SIMPLE.reifyStagger;
    reify.push(smoothstep(s, s + T_SIMPLE.reifyDur, pt));
    // Triangle flash peaking just after the chip solidifies.
    const u = pt - s;
    const f = u >= 0 && u < 0.5 ? 1 - Math.abs(u - 0.15) / 0.35 : 0;
    flash.push(Math.max(0, f) * alive);
  }
  return { harnessRect, harnessChips: 0, metaRect, metaChips, reify, flash };
}

function pinnedState(stage: 0 | 1 | 2): StageState {
  const on = (v: boolean) => (v ? 1 : 0);
  const reify = META_CHIPS.map(() => (stage >= 2 ? 1 : 0));
  const flash = META_CHIPS.map(() => 0);
  return {
    harnessRect: on(stage >= 1),
    harnessChips: on(stage >= 1),
    metaRect: on(stage >= 2),
    metaChips: on(stage >= 2),
    reify,
    flash,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MetaHarnessLayers({
  className,
  paused = false,
  stage = 'auto',
  variant = 'full',
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  style,
}: MetaHarnessLayersProps) {
  const simple = variant === 'simple';
  // Variant-dependent geometry: the simple harness rect is compact since it
  // holds no LLM or chips; meta connectors anchor to whichever rect is drawn.
  const harnessRect = simple ? HARNESS_RECT_SIMPLE : HARNESS_RECT;
  const { ref, inView } = useInView<HTMLDivElement>();
  // Click-to-expand state (refs: the rAF loop reads them, no re-render needed).
  const expandRef = useRef<ExpandState>({
    mode: null,
    open: false,
    t: 0,
    kernelStart: 0,
  });
  // Hit-test rects for clickable elements, rebuilt every drawn frame in
  // logical canvas coordinates (chip drift included).
  const hitsRef = useRef<HitRect[]>([]);
  // Which clickable chip the pointer is currently over (by chip id).
  const hoveredRef = useRef<string | null>(null);
  // Per-chip hover progress 0..1, integrated over HOVER_DUR each frame.
  const hoverTRef = useRef<Record<string, number>>({});
  // Panel rect (logical coords) while a panel is open, for outside-click close.
  const panelRef = useRef<Rect | null>(null);
  const elapsedRef = useRef(0);
  // The layered diagram's own cycle clock; freezes while expanded so the
  // build-up resumes where it left off when the user comes back.
  const mainClockRef = useRef(0);

  // Storybook/URL controls can deliver `stage` as a string ("0"); a strict
  // 'auto' check would then silently pin stage 0. Normalize once.
  const pinnedStage: 0 | 1 | 2 | null =
    stage === 'auto' || String(stage) === 'auto'
      ? null
      : (Math.min(2, Math.max(0, Number(stage) || 0)) as 0 | 1 | 2);

  const canvasRef = useCanvasAnimation({
    width,
    height,
    paused,
    active: inView,
    draw: ({ ctx, width: w, height: h, elapsed, dt }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      // ---- Panel open/close transition bookkeeping ------------------------
      elapsedRef.current = elapsed;
      hitsRef.current = [];
      const exp = expandRef.current;
      const expTarget = exp.open ? 1 : 0;
      if (exp.t !== expTarget) {
        exp.t = clamp01(exp.t + (exp.open ? dt : -dt) / EXPAND_DUR);
      }
      if (!exp.open && exp.t === 0) exp.mode = null;
      const et = easeInOut(exp.t);
      // Freeze the diagram's cycle while expanded; resume on the way back.
      if (!exp.open) mainClockRef.current += dt;

      // Stage state (auto cycle runs on the freezable main clock).
      const pt = mainClockRef.current % (simple ? CYCLE_SIMPLE : CYCLE);
      const st: StageState =
        pinnedStage === null
          ? simple
            ? autoStateSimple(pt)
            : autoState(pt)
          : pinnedState(pinnedStage);
      // Simple never draws the harness chips or the LLM, whatever the stage
      // pin says: zeroed alphas let the existing early-outs skip them.
      if (simple) st.harnessChips = 0;
      const llmAlpha = simple
        ? 0
        : pinnedStage === null
          ? smoothstep(T.llmFadeIn[0], T.llmFadeIn[1], elapsed)
          : 1;

      // Emphasis shift: once every meta chip has reified, attention moves to
      // the meta layer (slow accent breathing on its border, brighter chip
      // borders) while the core group dims slightly.
      const metaEmph =
        smoothstep(0.9, 1, Math.min(...st.reify)) * easeInOut(st.metaRect);
      const metaBreath = metaEmph * (0.15 + 0.1 * Math.sin(elapsed * 1.1));
      const metaStroke = rgbCss(mixRgb(OUTLINE_META_C, ACCENT_C, metaBreath));
      // Core group (LLM + harness + connectors) alpha: full in stages 0/1,
      // ~0.75 once the meta layer is up (stage 2).
      const coreDim = lerp(1, 0.75, easeInOut(st.metaRect));

      // Centers (idle drift only — no pointer parallax).
      const metaCenter: Pt = { x: cx, y: cy };
      const harnessCenter: Pt = { x: cx, y: cy };
      const llmDrift = drift(0.37, elapsed, 1.8);
      const llmCenter: Pt = { x: cx + llmDrift.x, y: cy + llmDrift.y };

      // ---- Outer: meta-harness layer (stays visible while expanded) -------
      drawLayer(
        ctx,
        metaCenter,
        META_RECT.w,
        META_RECT.h,
        22,
        metaStroke,
        st.metaRect,
        'Meta-harness',
      );
      // Meta-harness sublabel under the header (matches the harness one).
      if (st.metaRect > 0.4) {
        ctx.save();
        ga(ctx, easeInOut(st.metaRect));
        ctx.font = FONT_SUB;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = TEXT_LABEL;
        ctx.fillText(
          'Organization layer',
          metaCenter.x - META_RECT.w / 2 + 16,
          metaCenter.y - META_RECT.h / 2 + 36,
        );
        ctx.restore();
      }

      // Meta chips + connectors to the harness boundary.
      META_CHIPS.forEach((chip, i) => {
        const d = drift(chip.seed, elapsed);
        const c: Pt = { x: cx + chip.x + d.x, y: cy + chip.y + d.y };
        const reify = st.reify[i];
        const flash = st.flash[i];
        const alpha = st.metaChips;
        if (alpha <= 0.001) return;

        // Simple variant is fully inert: no clickable chips, no expand glyph.
        const clickable = !simple && CLICKABLE_CHIPS.has(chip.id);
        const isExpanded = exp.mode === chip.id;

        // Connector from chip inner edge to the harness rect boundary; fades
        // out during expansion since its target shrinks away with the core.
        if (et < 0.999) {
          const harnessEdge = rectEdge(
            harnessCenter.x,
            harnessCenter.y,
            harnessRect.w / 2,
            harnessRect.h / 2,
            c,
          );
          const chipEdge = rectEdge(
            c.x,
            c.y,
            META_CHIP.w / 2,
            META_CHIP.h / 2,
            harnessEdge,
          );
          drawConnector(ctx, chipEdge, harnessEdge, alpha * 0.5 * (1 - et));
        }

        // Hover progress, integrated toward the pointer state over HOVER_DUR.
        let hover = 0;
        if (clickable) {
          const target = hoveredRef.current === chip.id ? 1 : 0;
          const cur = hoverTRef.current[chip.id] ?? 0;
          const next = clamp01(cur + (target ? dt : -dt) / HOVER_DUR);
          hoverTRef.current[chip.id] = next;
          hover = next * next * (3 - 2 * next); // smoothstep ease
        }
        // The clicked chip keeps the full accent treatment while its panel is
        // open; the other meta chips recede behind it.
        if (isExpanded) hover = Math.max(hover, et);
        fadeMul = exp.mode && !isExpanded ? lerp(1, 0.35, et) : 1;
        drawMetaChip(
          ctx,
          c,
          chip.label,
          alpha,
          reify,
          flash,
          clickable,
          hover,
          metaEmph,
        );
        fadeMul = 1;

        // Register for hit-testing (only once settled). While a panel is
        // open, only the clicked chip stays live so a second click closes it.
        if (clickable && alpha > 0.9 && (!exp.mode || isExpanded)) {
          hitsRef.current.push({
            id: chip.id as ExpandMode,
            x: c.x - META_CHIP.w / 2,
            y: c.y - META_CHIP.h / 2,
            w: META_CHIP.w,
            h: META_CHIP.h,
          });
        }
      });

      // ---- Core group: harness + LLM (recedes while a panel is open) ------
      if (et < 0.999) {
        // Scale toward the canvas center and fade out as the panel opens;
        // additionally dimmed to `coreDim` once the meta layer is up.
        ctx.save();
        const cs = lerp(1, 0.6, et);
        ctx.translate(cx, cy);
        ctx.scale(cs, cs);
        ctx.translate(-cx, -cy);
        fadeMul = coreDim * (1 - et);

        // Middle: harness layer.
        drawLayer(
          ctx,
          harnessCenter,
          harnessRect.w,
          harnessRect.h,
          18,
          OUTLINE_HARNESS,
          st.harnessRect,
          'Harness',
        );
        // Harness sublabel under the header.
        if (st.harnessRect > 0.4) {
          ctx.save();
          ga(ctx, easeInOut(st.harnessRect));
          ctx.font = FONT_SUB;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = TEXT_LABEL;
          ctx.fillText(
            'Claude Code / Codex',
            harnessCenter.x - harnessRect.w / 2 + 16,
            harnessCenter.y - harnessRect.h / 2 + 36,
          );
          ctx.restore();
        }

        // Harness chips + feeding connectors with inward pulses.
        HARNESS_CHIPS.forEach((chip) => {
          const d = drift(chip.seed, elapsed);
          const c: Pt = { x: cx + chip.x + d.x, y: cy + chip.y + d.y };
          const alpha = st.harnessChips;
          if (alpha <= 0.001) return;

          const llmEdge = rectEdge(
            llmCenter.x,
            llmCenter.y,
            LLM.w / 2,
            LLM.h / 2,
            c,
          );
          const chipEdge = rectEdge(
            c.x,
            c.y,
            HARNESS_CHIP.w / 2,
            HARNESS_CHIP.h / 2,
            llmEdge,
          );
          drawConnector(ctx, chipEdge, llmEdge, alpha * 0.55);
          // Feed pulse: dot travelling from chip -> LLM.
          if (alpha > 0.15 && llmAlpha > 0.15) {
            const speed = 0.45;
            const tp = (elapsed * speed + chip.seed) % 1;
            const pos: Pt = {
              x: lerp(chipEdge.x, llmEdge.x, tp),
              y: lerp(chipEdge.y, llmEdge.y, tp),
            };
            // Fade the dot in/out near the endpoints.
            const dotA = Math.sin(tp * Math.PI) * alpha;
            drawPulse(ctx, pos, 2.6, dotA * 0.9);
          }
          drawHarnessChip(ctx, c, chip.label, alpha);
        });

        // Center: LLM node.
        drawLLM(ctx, llmCenter, llmAlpha);

        fadeMul = 1;
        ctx.restore();
      }

      // ---- Expanded mode: in-context panel with the network kernel --------
      panelRef.current = null;
      if (et > 0.001 && exp.mode) {
        // Panel size: shrink (rather than move the chips) if the default
        // footprint would collide with the top/bottom chip rows at y ±232.
        const fits = PANEL.h / 2 <= 232 - META_CHIP.h / 2 - 6;
        const pw = fits ? PANEL.w : PANEL_SMALL.w;
        const ph = fits ? PANEL.h : PANEL_SMALL.h;
        panelRef.current = { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph };

        // Connector: clicked chip inner edge -> nearest panel edge, growing
        // with the transition, with a small arrowhead at the panel end.
        const expChipDef = META_CHIPS.find((cd) => cd.id === exp.mode);
        if (expChipDef) {
          const d = drift(expChipDef.seed, elapsed);
          const chipC: Pt = {
            x: cx + expChipDef.x + d.x,
            y: cy + expChipDef.y + d.y,
          };
          const chipEdge = rectEdge(
            chipC.x,
            chipC.y,
            META_CHIP.w / 2,
            META_CHIP.h / 2,
            { x: cx, y: cy },
          );
          const panelEdge = rectEdge(cx, cy, pw / 2, ph / 2, chipC);
          const ex = lerp(chipEdge.x, panelEdge.x, et);
          const ey = lerp(chipEdge.y, panelEdge.y, et);
          const ang = Math.atan2(ey - chipEdge.y, ex - chipEdge.x);
          const ah = 3.5;
          ctx.save();
          ctx.globalAlpha = 0.5 * et;
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(chipEdge.x, chipEdge.y);
          ctx.lineTo(ex, ey);
          ctx.moveTo(
            ex - ah * Math.cos(ang - 0.5),
            ey - ah * Math.sin(ang - 0.5),
          );
          ctx.lineTo(ex, ey);
          ctx.lineTo(
            ex - ah * Math.cos(ang + 0.5),
            ey - ah * Math.sin(ang + 0.5),
          );
          ctx.stroke();
          ctx.restore();
        }

        // Panel body: grows from 0.85 scale while fading in.
        const ps = lerp(0.85, 1, et);
        const spw = pw * ps;
        const sph = ph * ps;
        const spx = cx - spw / 2;
        const spy = cy - sph / 2;
        ctx.save();
        ctx.globalAlpha = et;
        roundRectPath(ctx, spx, spy, spw, sph, PANEL.r * ps);
        ctx.fillStyle = PANEL.fill;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = PANEL.border;
        ctx.stroke();
        ctx.restore();

        // Network kernel: clipped to the panel, letterbox-fitted from the
        // kernels' native 960x600 logical space, running a fresh clock.
        const ka = clamp01((et - 0.7) / 0.3);
        if (ka > 0.001) {
          ctx.save();
          roundRectPath(ctx, spx, spy, spw, sph, PANEL.r * ps);
          ctx.clip();
          const ks = Math.min(spw / DEFAULT_WIDTH, sph / DEFAULT_HEIGHT);
          ctx.translate(
            spx + (spw - DEFAULT_WIDTH * ks) / 2,
            spy + (sph - DEFAULT_HEIGHT * ks) / 2,
          );
          ctx.scale(ks, ks);
          const kernelFrame = {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            elapsed: elapsed - exp.kernelStart,
            appear: ka,
          };
          if (exp.mode === 'sessions') drawSessionNetwork(ctx, kernelFrame);
          else drawRepositoryGraph(ctx, kernelFrame);
          ctx.restore();
        }

        // Close hint below the panel's bottom-right corner.
        ctx.save();
        ctx.globalAlpha = et;
        ctx.font = FONT_SUB;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#737373';
        ctx.fillText('esc to close', spx + spw, spy + sph + 8);
        ctx.restore();
      }
    },
  });

  // Hover tracking + click-to-expand + Escape-to-close. The simple variant is
  // fully inert: no listeners, no cursor changes, and no hits are registered.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || simple) return;
    // Event position in logical canvas coordinates (canvas is CSS-scaled).
    const toLogical = (e: MouseEvent): Pt => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * width,
        y: ((e.clientY - rect.top) / rect.height) * height,
      };
    };
    const hitAt = (p: Pt) =>
      hitsRef.current.find(
        (r) =>
          p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h,
      );
    const onMove = (e: MouseEvent) => {
      const hit = hitAt(toLogical(e));
      hoveredRef.current = hit ? hit.id : null;
      canvas.style.cursor = hit ? 'pointer' : '';
    };
    const onLeave = () => {
      hoveredRef.current = null;
      canvas.style.cursor = '';
    };
    const onClick = (e: MouseEvent) => {
      const p = toLogical(e);
      const hit = hitAt(p);
      const exp = expandRef.current;
      if (exp.open) {
        // While a panel is open only two targets are live: the clicked chip
        // (toggles closed) and anywhere outside the panel (dismisses).
        const panel = panelRef.current;
        const inPanel =
          panel !== null &&
          p.x >= panel.x &&
          p.x <= panel.x + panel.w &&
          p.y >= panel.y &&
          p.y <= panel.y + panel.h;
        if ((hit && hit.id === exp.mode) || !inPanel) {
          exp.open = false;
          canvas.style.cursor = '';
        }
        return;
      }
      if (!hit) return;
      exp.mode = hit.id;
      exp.open = true;
      exp.kernelStart = elapsedRef.current;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') expandRef.current.open = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [canvasRef, width, height, simple]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', maxWidth: width, ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concrete node/chip renderers
// ---------------------------------------------------------------------------
function drawConnector(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  alpha: number,
) {
  if (alpha <= 0.001) return;
  ctx.save();
  ga(ctx, alpha);
  ctx.strokeStyle = OUTLINE_HARNESS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawPulse(
  ctx: CanvasRenderingContext2D,
  pos: Pt,
  radius: number,
  alpha: number,
) {
  if (alpha <= 0.001) return;
  ctx.save();
  ga(ctx, clamp01(alpha));
  const grad = ctx.createRadialGradient(
    pos.x,
    pos.y,
    0,
    pos.x,
    pos.y,
    radius * 2.4,
  );
  grad.addColorStop(0, `rgba(${ACCENT_RGB}, 0.9)`);
  grad.addColorStop(1, `rgba(${ACCENT_RGB}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHarnessChip(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  label: string,
  alpha: number,
) {
  const eased = easeInOut(alpha);
  const x = center.x - HARNESS_CHIP.w / 2;
  const y = center.y - HARNESS_CHIP.h / 2;
  ctx.save();
  ga(ctx, eased);
  roundRectPath(ctx, x, y, HARNESS_CHIP.w, HARNESS_CHIP.h, 8);
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE_HARNESS;
  ctx.stroke();
  ctx.font = FONT_LABEL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_LABEL;
  ctx.fillText(label, center.x, center.y + 0.5);
  ctx.restore();
}

/**
 * Small expand affordance: two 45° arrows pointing to opposite corners of a
 * ~9px box, permanently visible on clickable chips (brighter on hover).
 */
function drawExpandGlyph(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  alpha: number,
) {
  const r = 4.5; // half of the glyph box
  const hd = 3; // arrowhead tick length
  ctx.save();
  ga(ctx, alpha);
  ctx.strokeStyle = TEXT_LABEL;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Arrow to the top-right corner.
  ctx.moveTo(gx - 0.5, gy + 0.5);
  ctx.lineTo(gx + r, gy - r);
  ctx.moveTo(gx + r - hd, gy - r);
  ctx.lineTo(gx + r, gy - r);
  ctx.lineTo(gx + r, gy - r + hd);
  // Arrow to the bottom-left corner.
  ctx.moveTo(gx + 0.5, gy - 0.5);
  ctx.lineTo(gx - r, gy + r);
  ctx.moveTo(gx - r + hd, gy + r);
  ctx.lineTo(gx - r, gy + r);
  ctx.lineTo(gx - r, gy + r - hd);
  ctx.stroke();
  ctx.restore();
}

function drawMetaChip(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  label: string,
  alpha: number,
  reify: number,
  flash: number,
  clickable: boolean,
  hover: number,
  emph: number,
) {
  const eased = easeInOut(alpha);
  ctx.save();
  // Hover: gentle scale-up around the chip center.
  if (hover > 0.001) {
    const sc = lerp(1, 1.05, hover);
    ctx.translate(center.x, center.y);
    ctx.scale(sc, sc);
    ctx.translate(-center.x, -center.y);
  }
  const x = center.x - META_CHIP.w / 2;
  const y = center.y - META_CHIP.h / 2;
  ga(ctx, eased);

  roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
  // Fill warms slightly toward the accent on hover.
  ctx.fillStyle = rgbCss(mixRgb([23, 23, 23], [31, 28, 22], hover));
  ctx.fill();

  // Reify flash: accent-tinted fill + glow at the moment of solidifying.
  if (flash > 0.001) {
    ctx.save();
    ga(ctx, eased * flash * 0.9);
    roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.18)`;
    ctx.fill();
    ctx.restore();
  }

  // Border crossfades dashed -> solid as the chip is reified.
  ctx.lineWidth = 1;
  // Dashed pass (fades out as reify -> 1).
  if (reify < 0.999) {
    ctx.save();
    ga(ctx, eased * (1 - reify));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = OUTLINE_HARNESS;
    roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
    ctx.stroke();
    ctx.restore();
  }
  // Solid pass (fades in as reify -> 1). Slightly brighter once the meta
  // layer carries the emphasis, lerping to the accent on hover; briefly
  // accent-tinted by the reify flash.
  if (reify > 0.001) {
    ctx.save();
    ga(ctx, eased * reify);
    const base: RGB = clickable ? [111, 111, 111] : [82, 82, 82];
    const bright: RGB = clickable ? [130, 130, 130] : [96, 96, 96];
    const solid = mixRgb(mixRgb(base, bright, emph), ACCENT_C, hover);
    ctx.strokeStyle =
      flash > 0.01
        ? `rgba(${ACCENT_RGB}, ${clamp01(0.5 + flash * 0.5)})`
        : rgbCss(solid);
    roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = FONT_LABEL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = reify > 0.5 ? TEXT_HEADER : TEXT_LABEL;
  ctx.fillText(label, center.x, center.y + 0.5);

  // Expand affordance at the right edge of clickable, reified chips.
  if (clickable && reify > 0.9) {
    drawExpandGlyph(
      ctx,
      x + META_CHIP.w - 13,
      center.y,
      eased * lerp(0.45, 1, hover),
    );
  }
  ctx.restore();
}

function drawLLM(ctx: CanvasRenderingContext2D, center: Pt, alpha: number) {
  if (alpha <= 0.001) return;
  const eased = easeInOut(alpha);
  const x = center.x - LLM.w / 2;
  const y = center.y - LLM.h / 2;

  ctx.save();
  ga(ctx, eased);

  // Node body — deliberately quiet (no glow, static neutral border): once the
  // meta layer reifies, the emphasis lives out there, not on the LLM.
  roundRectPath(ctx, x, y, LLM.w, LLM.h, 14);
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE_LLM;
  ctx.stroke();

  // Brand marks (Claude spark + OpenAI knot), a centered row above the label.
  const paths = getIconPaths();
  if (paths) {
    const iconSize = 22;
    const gap = 14;
    const rowW = iconSize * 2 + gap;
    const iconY = center.y - 26; // icon top
    const scale = iconSize / 24; // icons authored on a 24x24 viewBox

    ctx.save();
    ctx.translate(center.x - rowW / 2, iconY);
    ctx.scale(scale, scale);
    ctx.fillStyle = ACCENT; // Claude spark in the node's accent tint
    ctx.fill(paths.claude);
    ctx.restore();

    ctx.save();
    ctx.translate(center.x - rowW / 2 + iconSize + gap, iconY);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#d4d4d4'; // OpenAI knot in neutral
    ctx.fill(paths.openai);
    ctx.restore();
  }

  // Label.
  ctx.textAlign = 'center';
  ctx.font = FONT_HEADER;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT_HEADER;
  ctx.fillText('LLM', center.x, center.y + 26);

  ctx.restore();
}
