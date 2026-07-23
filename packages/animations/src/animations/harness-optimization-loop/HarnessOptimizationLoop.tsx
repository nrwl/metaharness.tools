import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { clamp01, easeInOut, smoothstep, type Pt } from '../../lib/anim';
import { useInView } from '../../lib/canvas';
import { usePalette } from '../../lib/theme';

/**
 * Harness optimization loop: the Stanford Meta-Harness sense of the term,
 * as the counterpart to {@link MetaHarnessLayers} (the orchestration sense).
 *
 * The outer frame is the meta-harness: an outer loop wrapped around a coding
 * agent (the proposer). Inside it, an accent pulse orbits three stations:
 *
 *  - Experience filesystem: code, scores and execution traces of every prior
 *    candidate. Entries accumulate as the search runs.
 *  - Proposer: the coding agent that reads that history, diagnoses failures
 *    and writes the next candidate harness.
 *  - Candidate harness: the inner unit under search. It wraps a frozen LLM;
 *    each new version is evaluated on the task set and its score improves.
 *
 * Three laps run (v2, v3, v4), each appending an entry to the filesystem,
 * then the loop settles on the best variant and restarts. Same visual
 * language as FeedbackLoop: opaque DOM boxes over an SVG world, arcs with a
 * travelling pulse occluded by the boxes, accent reserved for the live path.
 */
export interface HarnessOptimizationLoopProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze on a specific frame (0..CYCLE) — for stories. */
  seek?: number;
}

const FPS = 30;

// --- SVG world (wrapper locks to this aspect so DOM boxes overlay exactly) ---
const VW = 1000;
const VH = 560;

// Outer meta-harness frame.
const FRAME = { x: 10, y: 10, w: 980, h: 540, r: 24 };

// Box centers / sizes (world units).
const PROPOSER = { cx: 230, cy: 175, w: 250, h: 125 };
const HARNESS = { cx: 715, cy: 205, w: 350, h: 240 };
const FS = { cx: 420, cy: 452, w: 450, h: 140 };

// Loop edges as quadratic beziers between box perimeters.
const READ = {
  p0: { x: FS.cx - FS.w / 2, y: 430 },
  c: { x: 108, y: 330 },
  p1: { x: 205, y: PROPOSER.cy + PROPOSER.h / 2 },
};
const CODE = {
  p0: { x: PROPOSER.cx + PROPOSER.w / 2, y: 160 },
  c: { x: 447, y: 126 },
  p1: { x: HARNESS.cx - HARNESS.w / 2, y: 165 },
};
const LOG = {
  p0: { x: HARNESS.cx, y: HARNESS.cy + HARNESS.h / 2 },
  c: { x: 702, y: 378 },
  p1: { x: 600, y: FS.cy - FS.h / 2 },
};

const qbez = (e: { p0: Pt; c: Pt; p1: Pt }, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * e.p0.x + 2 * u * t * e.c.x + t * t * e.p1.x,
    y: u * u * e.p0.y + 2 * u * t * e.c.y + t * t * e.p1.y,
  };
};
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const pathOf = (e: { p0: Pt; c: Pt; p1: Pt }) =>
  `M ${e.p0.x} ${e.p0.y} Q ${e.c.x} ${e.c.y} ${e.p1.x} ${e.p1.y}`;

// ---------------------------------------------------------------------------
// Timeline — three laps of read → propose → code → evaluate → log → store,
// then an end hold on the best variant. Dwell segments slide the pulse along
// the chord between the adjacent arc endpoints; the chord runs under the
// opaque box, so the pulse reads as passing through the station.
// ---------------------------------------------------------------------------
type SegKind = 'read' | 'propose' | 'code' | 'evaluate' | 'log' | 'store';
const LAP_SEGS: ReadonlyArray<{ kind: SegKind; dur: number }> = [
  { kind: 'read', dur: 32 },
  { kind: 'propose', dur: 24 },
  { kind: 'code', dur: 32 },
  { kind: 'evaluate', dur: 34 },
  { kind: 'log', dur: 30 },
  { kind: 'store', dur: 20 },
];
const LAP = LAP_SEGS.reduce((a, s) => a + s.dur, 0);
const N_LAPS = 3;
const END_HOLD = 70;
export const CYCLE = LAP * N_LAPS + END_HOLD;

// Candidate scores per version (v1 is the hand-written seed).
const SCORES = ['28.3', '33.7', '35.5', '37.6'];

interface Resolved {
  lap: number;
  kind: SegKind | 'end';
  /** 0..1 progress within the segment. */
  t: number;
}
function resolve(frame: number): Resolved {
  if (frame >= LAP * N_LAPS) {
    return {
      lap: N_LAPS - 1,
      kind: 'end',
      t: clamp01((frame - LAP * N_LAPS) / END_HOLD),
    };
  }
  const lap = Math.floor(frame / LAP);
  let t = frame - lap * LAP;
  for (const seg of LAP_SEGS) {
    if (t < seg.dur) return { lap, kind: seg.kind, t: t / seg.dur };
    t -= seg.dur;
  }
  return { lap, kind: 'store', t: 1 };
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

export function HarnessOptimizationLoop({
  className,
  style,
  seek,
}: HarnessOptimizationLoopProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const frame = useLoopFrame(inView, seek);
  const { lap, kind, t } = resolve(frame);

  const palette = usePalette();
  const BOX_BG = palette.surface;
  const BOX_BORDER = palette.outline;
  const TEXT = palette.textHeader;
  const MUTED = palette.textLabel;
  const FAINT = palette.textDim;
  const ACCENT = palette.accent;
  const ACCENT_RGB = palette.accentRgb;
  const ARC = palette.textFaint;
  const GREEN = palette.statusOk;

  // --- derived display state ------------------------------------------------
  // Version shown on the harness box: the freshly proposed version arrives
  // when the code edge completes (start of 'evaluate').
  const version =
    kind === 'evaluate' || kind === 'log' || kind === 'store' || kind === 'end'
      ? lap + 2
      : lap + 1;
  const evaluating = kind === 'evaluate' && t < 0.82;
  const score = SCORES[Math.min(version, SCORES.length) - 1];

  // Filesystem entries: v1..v(lap+1) are stored; the next entry pops in
  // during 'store'. At the end hold everything is present.
  const storedCount = kind === 'end' ? SCORES.length : lap + 1;
  const popping = kind === 'store' ? easeInOut(clamp01(t * 1.6)) : 0;

  const done = kind === 'end' ? smoothstep(0, 0.25, t) : 0;
  // Fade the settled state near the very end of the hold so the loop restart
  // reads as a reset instead of a hard jump.
  const reset = kind === 'end' ? smoothstep(0.9, 1, t) : 0;

  // --- pulse position -------------------------------------------------------
  const e = easeInOut(t);
  let pulse: Pt = READ.p0;
  let pulseOpacity = 1;
  switch (kind) {
    case 'read':
      pulse = qbez(READ, e);
      break;
    case 'propose':
      pulse = lerpPt(READ.p1, CODE.p0, e); // under the proposer box
      break;
    case 'code':
      pulse = qbez(CODE, e);
      break;
    case 'evaluate':
      pulse = lerpPt(CODE.p1, LOG.p0, e); // under the harness box
      break;
    case 'log':
      pulse = qbez(LOG, e);
      break;
    case 'store':
      pulse = lerpPt(LOG.p1, READ.p0, e); // under the filesystem box
      pulseOpacity = lap === N_LAPS - 1 ? 1 - clamp01(t * 1.5) : 1;
      break;
    case 'end':
      pulseOpacity = 0;
      break;
  }

  // --- activity levels (0..1) ----------------------------------------------
  const inSeg = (k: SegKind) =>
    kind === k ? Math.min(smoothstep(0, 0.12, t), smoothstep(1, 0.88, t)) : 0;
  const readH = inSeg('read');
  const codeH = inSeg('code');
  const logH = inSeg('log');
  const proposerH =
    kind === 'propose'
      ? 1
      : kind === 'read'
        ? smoothstep(0.75, 1, t)
        : kind === 'code'
          ? smoothstep(0.25, 0, t)
          : 0;
  const harnessH =
    kind === 'evaluate'
      ? 1
      : kind === 'code'
        ? smoothstep(0.75, 1, t)
        : kind === 'log'
          ? smoothstep(0.25, 0, t)
          : 0;
  const fsH =
    kind === 'store'
      ? 1
      : kind === 'log'
        ? smoothstep(0.75, 1, t)
        : kind === 'read'
          ? smoothstep(0.25, 0, t)
          : 0;

  const proposerStatus =
    kind === 'read'
      ? 'reading prior runs…'
      : kind === 'propose'
        ? 'diagnosing failures…'
        : kind === 'code'
          ? `writing v${lap + 2}…`
          : '';

  const glow = (h: number, rgb: string, max = 6) =>
    `0 0 0 ${max * h}px rgba(${rgb}, ${0.16 * h})`;

  const iterationLabel =
    kind === 'end'
      ? `search settled · best of ${SCORES.length} candidates`
      : `iteration ${lap + 1} / ${N_LAPS}`;

  const arcLabel = (
    x: number,
    y: number,
    text: string,
    h: number,
    anchor: 'start' | 'middle' = 'middle',
  ) => (
    <>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontSize={17}
        fontStyle="italic"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={FAINT}
      >
        {text}
      </text>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontSize={17}
        fontStyle="italic"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={ACCENT}
        opacity={h}
      >
        {text}
      </text>
    </>
  );

  const arc = (e2: { p0: Pt; c: Pt; p1: Pt }, h: number) => (
    <>
      <path
        d={pathOf(e2)}
        fill="none"
        stroke={ARC}
        strokeWidth={1.6}
        opacity={0.5}
        markerEnd="url(#hol-arrow)"
      />
      <path
        d={pathOf(e2)}
        fill="none"
        stroke={ACCENT}
        strokeWidth={2.4}
        opacity={h}
        markerEnd="url(#hol-arrow-accent)"
      />
    </>
  );

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
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        ...style,
      }}
      aria-label="Harness optimization loop: a proposer coding agent reads the code, scores, and traces of prior candidates from an experience filesystem, writes a new candidate harness around a frozen LLM, the candidate is evaluated on tasks, and its logs are stored back — the loop keeps the best variant"
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
            id="hol-arrow"
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
            id="hol-arrow-accent"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={ACCENT} />
          </marker>
        </defs>

        {/* outer meta-harness frame */}
        <rect
          x={FRAME.x}
          y={FRAME.y}
          width={FRAME.w}
          height={FRAME.h}
          rx={FRAME.r}
          fill="none"
          stroke={mix(BOX_BORDER, GREEN, done * (1 - reset) * 0.6)}
          strokeWidth={1}
        />
        <text
          x={FRAME.x + 26}
          y={FRAME.y + 36}
          fontSize={15}
          fontWeight={600}
          fill={TEXT}
        >
          Meta-harness
        </text>
        <text x={FRAME.x + 26} y={FRAME.y + 56} fontSize={12.5} fill={FAINT}>
          Harness optimization outer loop
        </text>
        <text
          x={FRAME.x + FRAME.w - 26}
          y={FRAME.y + 36}
          textAnchor="end"
          fontSize={12.5}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill={kind === 'end' ? mix(FAINT, GREEN, done * (1 - reset)) : FAINT}
        >
          {iterationLabel}
        </text>

        {/* loop edges: base gray + accent overlay while the pulse travels */}
        {arc(READ, readH)}
        {arc(CODE, codeH)}
        {arc(LOG, logH)}

        {arcLabel(205, 338, 'reads code · scores · traces', readH, 'start')}
        {arcLabel(447, 108, 'proposes new harness code', codeH)}
        {arcLabel(740, 372, 'evaluation logs', logH, 'start')}

        {/* travelling pulse (occluded by the opaque boxes at each station) */}
        <circle
          cx={pulse.x}
          cy={pulse.y}
          r={16}
          fill={`rgba(${ACCENT_RGB}, 0.18)`}
          opacity={pulseOpacity}
        />
        <circle
          cx={pulse.x}
          cy={pulse.y}
          r={6.5}
          fill={ACCENT}
          opacity={pulseOpacity}
        />
      </svg>

      {/* proposer box */}
      <div
        style={{
          ...boxStyle(PROPOSER),
          borderRadius: 14,
          border: `1px solid ${mix(BOX_BORDER, ACCENT, proposerH)}`,
          background: BOX_BG,
          boxShadow: glow(proposerH, ACCENT_RGB),
          padding: '14px 16px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
          Proposer
        </div>
        <div style={{ fontSize: 13, color: MUTED }}>coding agent</div>
        <div
          style={{
            fontSize: 12,
            fontStyle: 'italic',
            color: ACCENT,
            marginTop: 6,
            minHeight: 16,
            opacity: proposerStatus ? 1 : 0,
          }}
        >
          {proposerStatus || ' '}
        </div>
      </div>

      {/* candidate harness box (the inner unit under search) */}
      <div
        style={{
          ...boxStyle(HARNESS),
          borderRadius: 14,
          border: `1px solid ${mix(
            mix(BOX_BORDER, ACCENT, harnessH),
            GREEN,
            done * (1 - reset),
          )}`,
          background: BOX_BG,
          boxShadow: glow(harnessH, ACCENT_RGB, 7),
          padding: '14px 18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            Candidate harness
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: ACCENT,
            }}
          >
            v{version}
          </div>
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
          prompts &middot; retrieval &middot; memory &middot; loop logic
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <div
            style={{
              borderRadius: 10,
              border: `1px solid ${mix(
                BOX_BORDER,
                ACCENT,
                kind === 'evaluate' ? 0.5 + 0.5 * Math.sin(t * 18) * 0.5 : 0,
              )}`,
              padding: '10px 26px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>LLM</div>
            <div style={{ fontSize: 11, color: FAINT }}>frozen</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 12.5,
            minHeight: 18,
            textAlign: 'center',
          }}
        >
          {done > 0 && reset < 1 ? (
            <span style={{ color: GREEN, opacity: done * (1 - reset) }}>
              kept &middot; best variant &middot; {score}%
            </span>
          ) : evaluating ? (
            <span style={{ color: ACCENT, fontStyle: 'italic' }}>
              evaluating on tasks&hellip;
            </span>
          ) : (
            <span style={{ color: MUTED }}>
              pass rate{' '}
              <span
                style={{
                  color: TEXT,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {score}%
              </span>
            </span>
          )}
        </div>
      </div>

      {/* experience filesystem box */}
      <div
        style={{
          ...boxStyle(FS),
          borderRadius: 14,
          border: `1px solid ${mix(BOX_BORDER, ACCENT, fsH)}`,
          background: BOX_BG,
          boxShadow: glow(fsH, ACCENT_RGB),
          padding: '14px 18px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
          Experience filesystem
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 2 }}>
          code &middot; scores &middot; traces of every candidate
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {SCORES.map((s, i) => {
            const stored = i < storedCount;
            const isPopping = i === storedCount && popping > 0;
            if (!stored && !isPopping) return null;
            const isBest = kind === 'end' && i === SCORES.length - 1;
            const color = isBest ? GREEN : i === storedCount - 1 || isPopping ? ACCENT : FAINT;
            return (
              <div
                key={s}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${mix(BOX_BORDER, color, isBest ? done * (1 - reset) : 0.55)}`,
                  padding: '3px 9px',
                  fontSize: 11.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: isBest ? mix(MUTED, GREEN, done * (1 - reset)) : MUTED,
                  opacity: isPopping ? popping : 1,
                }}
              >
                v{i + 1} &middot; {s}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
