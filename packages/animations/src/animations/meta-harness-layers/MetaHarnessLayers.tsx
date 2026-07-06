import { useEffect, useRef, type CSSProperties } from 'react';
import { useCanvasAnimation, useInView } from '../../lib/canvas';

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
 * as reusable components and chips made interactive (e.g. click-to-explode a
 * "Sessions" chip). No interactivity is wired up here beyond optional pointer
 * parallax.
 */
export interface MetaHarnessLayersProps {
  /** Forwarded to the wrapper element. */
  className?: string;
  /** Freeze on a single static frame. */
  paused?: boolean;
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
// the LLM pulse, the feed pulses travelling into the LLM, and the reify flash.
// ---------------------------------------------------------------------------
const BG = '#0a0a0a';
const FILL = '#171717';
const OUTLINE_META = '#262626';
const OUTLINE_HARNESS = '#404040';
const OUTLINE_LLM = '#404040';
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
// Drawing primitives
// ---------------------------------------------------------------------------
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
  ctx.globalAlpha = eased;
  ctx.translate(center.x, center.y);
  ctx.scale(scale, scale);
  ctx.translate(-center.x, -center.y);

  const x = center.x - w / 2;
  const y = center.y - h / 2;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = FILL;
  ctx.globalAlpha = eased * 0.55;
  ctx.fill();
  ctx.globalAlpha = eased;
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
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  style,
}: MetaHarnessLayersProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  // Normalized pointer position over the canvas (-1..1), for subtle parallax.
  const pointer = useRef<Pt>({ x: 0, y: 0 });

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
    draw: ({ ctx, width: w, height: h, elapsed }) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      // Parallax offset per layer depth (inner moves most).
      const px = pointer.current.x;
      const py = pointer.current.y;
      const par = (depth: number): Pt => ({ x: px * depth, y: py * depth });
      const parLLM = par(3.2);
      const parHarness = par(2.0);
      const parMeta = par(1.0);

      // Stage state.
      const pt = elapsed % CYCLE;
      const st: StageState =
        pinnedStage === null ? autoState(pt) : pinnedState(pinnedStage);
      const llmAlpha =
        pinnedStage === null
          ? smoothstep(T.llmFadeIn[0], T.llmFadeIn[1], elapsed)
          : 1;

      // Drifted centers.
      const metaCenter: Pt = {
        x: cx + parMeta.x,
        y: cy + parMeta.y,
      };
      const harnessCenter: Pt = {
        x: cx + parHarness.x,
        y: cy + parHarness.y,
      };
      const llmDrift = drift(0.37, elapsed, 1.8);
      const llmCenter: Pt = {
        x: cx + llmDrift.x + parLLM.x,
        y: cy + llmDrift.y + parLLM.y,
      };

      // ---- Outer: meta-harness layer -------------------------------------
      drawLayer(
        ctx,
        metaCenter,
        META_RECT.w,
        META_RECT.h,
        22,
        OUTLINE_META,
        st.metaRect,
        'Meta-harness',
      );
      // Meta-harness sublabel under the header (matches the harness one).
      if (st.metaRect > 0.4) {
        ctx.save();
        ctx.globalAlpha = easeInOut(st.metaRect);
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
        const c: Pt = {
          x: cx + chip.x + d.x + parMeta.x,
          y: cy + chip.y + d.y + parMeta.y,
        };
        const reify = st.reify[i];
        const flash = st.flash[i];
        const alpha = st.metaChips;
        if (alpha <= 0.001) return;

        // Connector from chip inner edge to the harness rect boundary.
        const harnessEdge = rectEdge(
          harnessCenter.x,
          harnessCenter.y,
          HARNESS_RECT.w / 2,
          HARNESS_RECT.h / 2,
          c,
        );
        const chipEdge = rectEdge(
          c.x,
          c.y,
          META_CHIP.w / 2,
          META_CHIP.h / 2,
          harnessEdge,
        );
        drawConnector(ctx, chipEdge, harnessEdge, alpha * 0.5);

        drawMetaChip(ctx, c, chip.label, alpha, reify, flash);
      });

      // ---- Middle: harness layer -----------------------------------------
      drawLayer(
        ctx,
        harnessCenter,
        HARNESS_RECT.w,
        HARNESS_RECT.h,
        18,
        OUTLINE_HARNESS,
        st.harnessRect,
        'Harness',
      );
      // Harness sublabel under the header.
      if (st.harnessRect > 0.4) {
        ctx.save();
        ctx.globalAlpha = easeInOut(st.harnessRect);
        ctx.font = FONT_SUB;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = TEXT_LABEL;
        ctx.fillText(
          'Claude Code / Codex',
          harnessCenter.x - HARNESS_RECT.w / 2 + 16,
          harnessCenter.y - HARNESS_RECT.h / 2 + 36,
        );
        ctx.restore();
      }

      // Harness chips + feeding connectors with inward pulses.
      HARNESS_CHIPS.forEach((chip) => {
        const d = drift(chip.seed, elapsed);
        const c: Pt = {
          x: cx + chip.x + d.x + parHarness.x,
          y: cy + chip.y + d.y + parHarness.y,
        };
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

      // ---- Center: LLM node ----------------------------------------------
      drawLLM(ctx, llmCenter, llmAlpha, elapsed);
    },
  });

  // Pointer parallax: track normalized cursor position over the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.current = { x: clampPar(nx), y: clampPar(ny) };
    };
    const onLeave = () => {
      pointer.current = { x: 0, y: 0 };
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [canvasRef]);

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

const clampPar = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

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
  ctx.globalAlpha = alpha;
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
  ctx.globalAlpha = clamp01(alpha);
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
  ctx.globalAlpha = eased;
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

function drawMetaChip(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  label: string,
  alpha: number,
  reify: number,
  flash: number,
) {
  const eased = easeInOut(alpha);
  const x = center.x - META_CHIP.w / 2;
  const y = center.y - META_CHIP.h / 2;
  ctx.save();
  ctx.globalAlpha = eased;

  roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
  ctx.fillStyle = FILL;
  ctx.fill();

  // Reify flash: accent-tinted fill + glow at the moment of solidifying.
  if (flash > 0.001) {
    ctx.save();
    ctx.globalAlpha = eased * flash * 0.9;
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
    ctx.globalAlpha = eased * (1 - reify);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = OUTLINE_HARNESS;
    roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
    ctx.stroke();
    ctx.restore();
  }
  // Solid pass (fades in as reify -> 1), briefly accent-tinted by the flash.
  if (reify > 0.001) {
    ctx.save();
    ctx.globalAlpha = eased * reify;
    ctx.strokeStyle =
      flash > 0.01
        ? `rgba(${ACCENT_RGB}, ${clamp01(0.5 + flash * 0.5)})`
        : '#525252';
    roundRectPath(ctx, x, y, META_CHIP.w, META_CHIP.h, 8);
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = FONT_LABEL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = reify > 0.5 ? TEXT_HEADER : TEXT_LABEL;
  ctx.fillText(label, center.x, center.y + 0.5);
  ctx.restore();
}

function drawLLM(
  ctx: CanvasRenderingContext2D,
  center: Pt,
  alpha: number,
  elapsed: number,
) {
  if (alpha <= 0.001) return;
  const eased = easeInOut(alpha);
  const x = center.x - LLM.w / 2;
  const y = center.y - LLM.h / 2;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.6);

  ctx.save();
  ctx.globalAlpha = eased;

  // Accent glow behind the node, breathing.
  const glowR = LLM.w * 0.9;
  const glow = ctx.createRadialGradient(
    center.x,
    center.y,
    LLM.h * 0.3,
    center.x,
    center.y,
    glowR,
  );
  glow.addColorStop(0, `rgba(${ACCENT_RGB}, ${0.1 + 0.12 * pulse})`);
  glow.addColorStop(1, `rgba(${ACCENT_RGB}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center.x, center.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Node body.
  roundRectPath(ctx, x, y, LLM.w, LLM.h, 14);
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${0.45 + 0.35 * pulse})`;
  ctx.stroke();
  // Neutral inner border keeps it grounded with the rest of the palette.
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE_LLM;
  roundRectPath(ctx, x + 1.5, y + 1.5, LLM.w - 3, LLM.h - 3, 12);
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
