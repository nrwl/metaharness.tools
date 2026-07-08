import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { clamp01, easeInOut, smoothstep } from '../../lib/anim';
import { useInView } from '../../lib/canvas';
import claudeCodeLogo from '../harness-swap-diagram/logos/claude-code.svg?url';
import codexLogo from '../harness-swap-diagram/logos/codex.svg?url';

/**
 * Feedback loops: a goal-driven loop where the harness works, the meta-harness
 * checks the stop condition, and — until the goal is met — sends it back to
 * work; when the condition passes, the loop ends. An accent pulse orbits the
 * cycle (up "tries to stop", down "condition not met, sent back to work") for a
 * couple of turns, then breaks out to a green "Loop ends".
 *
 * Everything cross-fades on eased ramps and the pulse is occluded by the opaque
 * boxes at each node (rather than blinking on/off), so the motion reads as one
 * continuous flow. Self-contained SVG + DOM, driven by a looping rAF clock
 * (frozen off-screen / when `seek` is set).
 */
export interface FeedbackLoopProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze on a specific frame (0..CYCLE) — for stories. */
  seek?: number;
}

const FPS = 30;

// --- SVG world (wrapper is locked to this aspect so the DOM boxes overlay the
// SVG coordinates exactly) ---
const VW = 1000;
const VH = 480;

// box centers / sizes (world units)
const HARNESS = { cx: 165, cy: 240, w: 214, h: 120 };
const META = { cx: 500, cy: 240, w: 220, h: 132 };
const ENDS = { cx: 852, cy: 240, w: 252, h: 132 };

// loop circle between harness and meta
const CX = (HARNESS.cx + META.cx) / 2;
const CY = 240;
const R = (META.cx - HARNESS.cx) / 2;
const HARNESS_PT = { x: CX - R, y: CY }; // angle π
const META_PT = { x: CX + R, y: CY }; // angle 0
const ENDS_PT = { x: ENDS.cx - ENDS.w / 2, y: CY };

// palette (site dark theme)
const BOX_BG = '#171717';
const BOX_BORDER = '#262626';
const TEXT = '#e5e5e5';
const MUTED = '#a3a3a3';
const FAINT = '#737373';
const ACCENT = '#d4b483';
const ACCENT_RGB = '212, 180, 131';
const ARC = '#52525b';
const GREEN = '#5bd6a0';
const GREEN_RGB = '91, 214, 160';

const ptOnCircle = (a: number) => ({
  x: CX + R * Math.cos(a),
  y: CY + R * Math.sin(a),
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;

// arcs are trimmed to where the circle meets each box edge, so the arrowheads
// land visibly on the box perimeter (rather than behind an opaque box).
const A_HARNESS_TOP = rad(200);
const A_META_TOP = rad(337);
const A_META_BOT = rad(23);
const A_HARNESS_BOT = rad(160);

// ---------------------------------------------------------------------------
// Timeline — a sequence of segments (2 "not met" laps, then break out).
// ---------------------------------------------------------------------------
type SegKind = 'work' | 'top' | 'check' | 'bottom' | 'exit' | 'ended';
interface Seg {
  kind: SegKind;
  dur: number;
  met?: boolean;
}
const SEGS: Seg[] = [
  ...Array.from({ length: 2 }, () => [
    { kind: 'work' as const, dur: 13 },
    { kind: 'top' as const, dur: 34 },
    { kind: 'check' as const, dur: 17 },
    { kind: 'bottom' as const, dur: 34 },
  ]).flat(),
  { kind: 'work', dur: 13 },
  { kind: 'top', dur: 34 },
  { kind: 'check', dur: 20, met: true },
  { kind: 'exit', dur: 34 },
  { kind: 'ended', dur: 54 },
];
export const CYCLE = SEGS.reduce((a, s) => a + s.dur, 0);
const STARTS = SEGS.reduce<number[]>((acc, _s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SEGS[i - 1].dur);
  return acc;
}, []);

/** Frame intervals during which segments of a given kind are active. */
const intervalsFor = (kind: SegKind): Array<[number, number]> =>
  SEGS.flatMap((s, i) =>
    s.kind === kind ? [[STARTS[i], STARTS[i] + s.dur] as [number, number]] : [],
  );
const IV = {
  work: intervalsFor('work'),
  top: intervalsFor('top'),
  check: intervalsFor('check'),
  bottom: intervalsFor('bottom'),
  exit: intervalsFor('exit'),
  ended: intervalsFor('ended'),
};

/**
 * Smooth 0..1 "how active is this element right now", ramping in/out `ramp`
 * frames beyond each interval so neighbouring elements cross-fade. Loop-aware.
 */
function hotness(
  frame: number,
  intervals: Array<[number, number]>,
  ramp = 9,
): number {
  let h = 0;
  for (const [s, e] of intervals) {
    for (const off of [-CYCLE, 0, CYCLE]) {
      const a = s + off;
      const b = e + off;
      const v =
        clamp01((frame - (a - ramp)) / ramp) *
        clamp01((b + ramp - frame) / ramp);
      h = Math.max(h, smoothstep(0, 1, v));
    }
  }
  return h;
}

const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (h1: string, h2: string, t: number): string => {
  const a = hexRgb(h1);
  const b = hexRgb(h2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ')})`;
};

interface LoopState {
  x: number;
  y: number;
  met: boolean;
  dotOpacity: number;
}
function loopState(frame: number): LoopState {
  let t = frame;
  let i = 0;
  while (i < SEGS.length && t >= SEGS[i].dur) {
    t -= SEGS[i].dur;
    i++;
  }
  if (i >= SEGS.length) i = SEGS.length - 1;
  const seg = SEGS[i];
  const p = seg.dur ? clamp01(t / seg.dur) : 1;
  const e = easeInOut(p); // dot eases to near-stop at each node, glides mid-arc
  const met =
    SEGS.slice(0, i).some((s) => s.kind === 'check' && s.met) || !!seg.met;

  // continuous position around the loop; the pulse is occluded by the opaque
  // boxes at the nodes, so no opacity blink is needed there.
  let x = HARNESS_PT.x;
  let y = HARNESS_PT.y;
  let dotOpacity = 1;
  switch (seg.kind) {
    case 'work':
      x = HARNESS_PT.x;
      y = HARNESS_PT.y;
      break;
    case 'top':
      ({ x, y } = ptOnCircle(lerp(Math.PI, 2 * Math.PI, e)));
      break;
    case 'check':
      x = META_PT.x;
      y = META_PT.y;
      break;
    case 'bottom':
      ({ x, y } = ptOnCircle(lerp(0, Math.PI, e)));
      break;
    case 'exit':
      x = lerp(META_PT.x, ENDS_PT.x, e);
      y = CY;
      break;
    case 'ended':
      x = ENDS_PT.x;
      y = CY;
      dotOpacity = 1 - clamp01((t - 6) / 12); // absorbed into the box
      break;
  }
  return { x, y, met, dotOpacity };
}

// static arc paths, trimmed to the box edges
const _hTop = ptOnCircle(A_HARNESS_TOP);
const _mTop = ptOnCircle(A_META_TOP);
const _mBot = ptOnCircle(A_META_BOT);
const _hBot = ptOnCircle(A_HARNESS_BOT);
const TOP_PATH = `M ${_hTop.x} ${_hTop.y} A ${R} ${R} 0 0 1 ${_mTop.x} ${_mTop.y}`;
const BOTTOM_PATH = `M ${_mBot.x} ${_mBot.y} A ${R} ${R} 0 0 1 ${_hBot.x} ${_hBot.y}`;

const boxStyle = (b: { cx: number; cy: number; w: number }): CSSProperties => ({
  position: 'absolute',
  left: `${(b.cx / VW) * 100}%`,
  top: `${(b.cy / VH) * 100}%`,
  width: `${(b.w / VW) * 100}%`,
  transform: 'translate(-50%, -50%)',
  boxSizing: 'border-box',
});

// ---------------------------------------------------------------------------
// clock
// ---------------------------------------------------------------------------
function useLoopFrame(active: boolean, seek: number | undefined): number {
  const [frame, setFrame] = useState(seek ?? 0);
  const elapsedRef = useRef(0);
  useEffect(() => {
    if (seek !== undefined) {
      setFrame(seek);
      return;
    }
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      elapsedRef.current += dt;
      setFrame((elapsedRef.current * FPS) % CYCLE);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, seek]);
  return seek ?? frame;
}

export function FeedbackLoop({ className, style, seek }: FeedbackLoopProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const frame = useLoopFrame(inView, seek);
  const s = loopState(frame);

  // eased activity levels (0..1) for every element
  const harnessH = hotness(frame, IV.work);
  const metaH = hotness(frame, IV.check);
  const topH = hotness(frame, IV.top);
  const bottomH = hotness(frame, IV.bottom);
  const endsH = Math.max(hotness(frame, IV.exit), hotness(frame, IV.ended));

  const glow = (h: number, rgb: string, max = 6) =>
    `0 0 0 ${max * h}px rgba(${rgb}, ${0.16 * h})`;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        aspectRatio: `${VW} / ${VH}`,
        ...style,
      }}
      aria-label="A goal-driven feedback loop: the harness works, the meta-harness checks the stop condition and sends it back until the goal is met, then the loop ends"
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        <defs>
          <marker
            id="fl-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={ARC} />
          </marker>
          <marker
            id="fl-arrow-accent"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={ACCENT} />
          </marker>
          <marker
            id="fl-arrow-green"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={GREEN} />
          </marker>
        </defs>

        {/* top arc: base gray + accent overlay that cross-fades in */}
        <path
          d={TOP_PATH}
          fill="none"
          stroke={ARC}
          strokeWidth={1.6}
          opacity={0.5}
          markerEnd="url(#fl-arrow)"
        />
        <path
          d={TOP_PATH}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.4}
          opacity={topH}
          markerEnd="url(#fl-arrow-accent)"
        />

        {/* bottom arc */}
        <path
          d={BOTTOM_PATH}
          fill="none"
          stroke={ARC}
          strokeWidth={1.6}
          opacity={0.5}
          markerEnd="url(#fl-arrow)"
        />
        <path
          d={BOTTOM_PATH}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.4}
          opacity={bottomH}
          markerEnd="url(#fl-arrow-accent)"
        />

        {/* exit arrow: base gray + green overlay */}
        <line
          x1={META.cx + META.w / 2 + 6}
          y1={CY}
          x2={ENDS.cx - ENDS.w / 2 - 10}
          y2={CY}
          stroke={ARC}
          strokeWidth={1.6}
          opacity={0.5}
          markerEnd="url(#fl-arrow)"
        />
        <line
          x1={META.cx + META.w / 2 + 6}
          y1={CY}
          x2={ENDS.cx - ENDS.w / 2 - 10}
          y2={CY}
          stroke={GREEN}
          strokeWidth={2.4}
          opacity={endsH}
          markerEnd="url(#fl-arrow-green)"
        />

        {/* arc labels (faint base + accent overlay) */}
        <text
          x={CX}
          y={42}
          textAnchor="middle"
          fontSize={22}
          fontStyle="italic"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill={FAINT}
        >
          tries to stop
        </text>
        <text
          x={CX}
          y={42}
          textAnchor="middle"
          fontSize={22}
          fontStyle="italic"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill={ACCENT}
          opacity={topH}
        >
          tries to stop
        </text>
        <text
          x={CX}
          y={462}
          textAnchor="middle"
          fontSize={22}
          fontStyle="italic"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill={FAINT}
        >
          condition not met, sent back to work
        </text>
        <text
          x={CX}
          y={462}
          textAnchor="middle"
          fontSize={22}
          fontStyle="italic"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill={ACCENT}
          opacity={bottomH}
        >
          condition not met, sent back to work
        </text>

        {/* travelling pulse (occluded by the opaque boxes at each node) */}
        <circle
          cx={s.x}
          cy={s.y}
          r={16}
          fill={`rgba(${s.met ? GREEN_RGB : ACCENT_RGB}, 0.18)`}
          opacity={s.dotOpacity}
        />
        <circle
          cx={s.x}
          cy={s.y}
          r={6.5}
          fill={s.met ? GREEN : ACCENT}
          opacity={s.dotOpacity}
        />
      </svg>

      {/* harness box */}
      <div
        style={{
          ...boxStyle(HARNESS),
          borderRadius: 14,
          border: `1px solid ${mix(BOX_BORDER, ACCENT, harnessH)}`,
          background: BOX_BG,
          boxShadow: glow(harnessH, ACCENT_RGB),
          padding: '14px 16px',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <img
            src={claudeCodeLogo}
            alt=""
            aria-hidden="true"
            style={{ width: 20, height: 20 }}
          />
          <img
            src={codexLogo}
            alt=""
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              filter: 'invert(1)',
              opacity: 0.85,
            }}
          />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
          Harness works
        </div>
        <div style={{ fontSize: 13, color: MUTED }}>on the task</div>
      </div>

      {/* meta-harness box (highlighted) */}
      <div
        style={{
          ...boxStyle(META),
          borderRadius: 14,
          border: `1px solid ${ACCENT}`,
          background: '#1b1712',
          boxShadow: glow(metaH, ACCENT_RGB, 7),
          padding: '16px 18px',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: ACCENT,
          }}
        >
          Meta-harness
        </div>
        <div
          style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginTop: 4 }}
        >
          Checks the condition
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
          each time it tries to stop
        </div>
      </div>

      {/* loop ends box (goes green when the goal is met) */}
      <div
        style={{
          ...boxStyle(ENDS),
          borderRadius: 14,
          border: `1px solid ${mix(BOX_BORDER, GREEN, endsH)}`,
          background: `rgba(${GREEN_RGB}, ${0.08 * endsH})`,
          padding: '16px 18px',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: mix(TEXT, GREEN, endsH),
          }}
        >
          Loop ends
        </div>
        <div
          style={{
            fontSize: 13,
            color: MUTED,
            marginTop: 3,
            fontStyle: 'italic',
          }}
        >
          goal met, or the turn limit is reached
        </div>
      </div>
    </div>
  );
}
