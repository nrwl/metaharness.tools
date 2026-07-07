import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useInView } from '../../lib/canvas';
import {
  CLAUDE,
  CONSOLE_FONT,
  Cursor,
  FPS,
  FrameProvider,
  interpolate,
  useFrame,
  useTyped,
} from '../provisioning-setup/terminal';
import commitMono400 from '../provisioning-setup/fonts/commit-mono-400.woff2?url';
import commitMono700 from '../provisioning-setup/fonts/commit-mono-700.woff2?url';
import { CYCLE, drawSessionDurability, STAGE_H, STAGE_W } from './kernel';

/**
 * Session durability: the reverse of IsolatedSessions. Each teammate's parked
 * session dot expands back into its full session bubble and flies up into a
 * central session store, indexing itself as a row. Once captured, the laptops
 * fade, the store slides left, and a Claude terminal types "Resume the order
 * cancellation session" — the matching stored row lights up, streaks into the
 * terminal, and the resume log takes over (restoring context, provisioning
 * worktrees, replaying state). The spatial scene is a canvas kernel; the
 * terminal is a DOM overlay reusing the ported terminal primitives. Both run
 * off one virtual-frame clock so their beats line up.
 */
export interface SessionDurabilityProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze on a specific frame (0..CYCLE) instead of animating — for stories. */
  seek?: number;
}

// --- terminal placement within the stage (matches kernel TERM_CENTER) ---
const TERM = { x: 360, y: 44, w: 560, h: 472 };
const TERM_IN = [190, 214] as const;

// --- terminal timeline (virtual 30fps) ---
const TYPE_START = 220;
const PROMPT = 'Resume the order cancellation session';
const SUBMIT = 272;
const LOG_START = 320;

// ---------------------------------------------------------------------------
// Header (Claude Code) — pixel mascot + meta lines, CLAUDE palette.
// ---------------------------------------------------------------------------
const MASCOT = [
  '..X..X..',
  'XXXXXXXX',
  'XXOXXOXX',
  'XXXXXXXX',
  '.XXXXXX.',
  '.X.XX.X.',
];
const Mascot: React.FC<{ accent: string; cell?: number }> = ({ accent, cell = 6 }) => (
  <svg
    width={MASCOT[0].length * cell}
    height={MASCOT.length * cell}
    style={{ display: 'block', shapeRendering: 'crispEdges', flex: 'none' }}
  >
    {MASCOT.flatMap((row, r) =>
      row.split('').map((c, x) =>
        c === '.' ? null : (
          <rect
            key={`${r}-${x}`}
            x={x * cell}
            y={r * cell}
            width={cell}
            height={cell}
            fill={c === 'O' ? '#171310' : accent}
          />
        ),
      ),
    )}
  </svg>
);

const Header: React.FC = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
    <Mascot accent={CLAUDE.accent} />
    <div style={{ lineHeight: 1.4, fontFamily: CONSOLE_FONT, fontSize: 14 }}>
      <div style={{ color: CLAUDE.text }}>
        <span style={{ fontWeight: 700 }}>Claude Code</span>{' '}
        <span style={{ color: CLAUDE.muted }}>v2.1</span>
      </div>
      <div style={{ color: CLAUDE.muted }}>Opus 4.8 · resuming a stored session</div>
    </div>
  </div>
);

// pulsing dot -> star spinner glyph (the TUI "working" indicator)
const STAR_CYCLE = ['·', '✢', '✦', '✶', '✻', '✶', '✦', '✢'];
const StarSpinner: React.FC<{ color: string }> = ({ color }) => {
  const frame = useFrame();
  return (
    <span style={{ color, width: '1ch', display: 'inline-block', textAlign: 'center' }}>
      {STAR_CYCLE[Math.floor(frame / 3) % STAR_CYCLE.length]}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Resume log lines — appear staggered; the working ones spin then resolve green.
// ---------------------------------------------------------------------------
interface LogDef {
  at: number;
  /** shown while working; omit for an instant check line. */
  working?: string;
  /** shown once resolved (frame >= doneAt). */
  done: string;
  doneAt?: number;
}
const LOG: LogDef[] = [
  { at: LOG_START + 4, done: 'Located session impl-cancel-order · 568d33ca' },
  { at: LOG_START + 18, working: 'Restoring session context…', done: 'Restored context · 3 repos · 128 files', doneAt: LOG_START + 42 },
  { at: LOG_START + 46, working: 'Provisioning worktrees…', done: 'Worktrees ready', doneAt: LOG_START + 72 },
  { at: LOG_START + 76, working: 'Replaying conversation state…', done: '42 messages · 6 tool calls replayed', doneAt: LOG_START + 100 },
  { at: LOG_START + 104, done: 'Session resumed · continuing where it left off' },
];

const LogLine: React.FC<{ def: LogDef }> = ({ def }) => {
  const frame = useFrame();
  if (frame < def.at) return null;
  const doneAt = def.doneAt ?? def.at;
  const done = frame >= doneAt;
  const reveal = interpolate(frame, [def.at, def.at + 10], [0, 1]);
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginTop: 9,
        fontFamily: CONSOLE_FONT,
        fontSize: 14,
        opacity: reveal,
        transform: `translateY(${interpolate(frame, [def.at, def.at + 10], [6, 0])}px)`,
      }}
    >
      {done ? (
        <span style={{ color: CLAUDE.success }}>✓</span>
      ) : (
        <StarSpinner color={CLAUDE.accent} />
      )}
      <span style={{ color: done ? CLAUDE.muted : CLAUDE.text }}>
        {done ? def.done : def.working ?? def.done}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Terminal overlay
// ---------------------------------------------------------------------------
const Terminal: React.FC = () => {
  const frame = useFrame();
  const tw = useTyped(PROMPT, { startFrame: TYPE_START, cps: 26 });
  const typing = frame < SUBMIT;
  const slideIn = interpolate(frame, [TERM_IN[0], TERM_IN[1]], [1, 0]);
  const fade = interpolate(frame, [520, CYCLE], [1, 0]);
  const submitted = frame >= SUBMIT;

  const body: ReactNode = submitted ? (
    <>
      <div
        style={{
          background: CLAUDE.promptHighlight,
          borderRadius: 8,
          padding: '5px 9px',
          margin: '-3px -9px',
          fontFamily: CONSOLE_FONT,
          fontSize: 14,
          color: CLAUDE.text,
          opacity: interpolate(frame, [SUBMIT, SUBMIT + 10], [0, 1]),
        }}
      >
        <span style={{ color: CLAUDE.muted, marginRight: 8 }}>›</span>
        {PROMPT}
      </div>
      <div style={{ marginTop: 6 }}>
        {LOG.map((d, i) => (
          <LogLine key={i} def={d} />
        ))}
      </div>
    </>
  ) : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: TERM.x,
        top: TERM.y,
        width: TERM.w,
        height: TERM.h,
        transform: `translateX(${slideIn * (TERM.w + 90)}px)`,
        opacity: fade,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: 24,
        background: CLAUDE.bg,
        border: `1px solid ${CLAUDE.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        fontFamily: CONSOLE_FONT,
      }}
    >
      <Header />
      <div style={{ flex: 1, minHeight: 0, marginTop: 18 }}>{body}</div>
      <div
        style={{
          borderTop: `1px solid ${CLAUDE.rule}`,
          paddingTop: 13,
          fontFamily: CONSOLE_FONT,
          fontSize: 14,
          color: CLAUDE.text,
          whiteSpace: 'pre',
        }}
      >
        <span style={{ color: CLAUDE.muted, marginRight: 8 }}>❯</span>
        {typing ? tw.shown : ''}
        <Cursor color={CLAUDE.cursor} blink={!typing} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Looping rAF clock (gated by inView; frozen when `seek` is set)
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

export function SessionDurability({ className, style, seek }: SessionDurabilityProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const frame = useLoopFrame(inView, seek);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / STAGE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    if (cv.width !== STAGE_W * dpr) {
      cv.width = STAGE_W * dpr;
      cv.height = STAGE_H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    drawSessionDurability(ctx, frame);
  }, [frame]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', aspectRatio: `${STAGE_W} / ${STAGE_H}`, ...style }}
      aria-label="Session durability: teammate sessions are captured into a central store, then one is resumed in a Claude terminal"
    >
      <style>{`
        @font-face {
          font-family: 'Commit Mono';
          src: url(${commitMono400}) format('woff2');
          font-weight: 400; font-style: normal; font-display: block;
        }
        @font-face {
          font-family: 'Commit Mono';
          src: url(${commitMono700}) format('woff2');
          font-weight: 700; font-style: normal; font-display: block;
        }
      `}</style>
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          position: 'relative',
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <FrameProvider value={frame}>
          <Terminal />
        </FrameProvider>
        {/* Canvas sits above the terminal so the resume streak lands visibly over
            it; it is transparent everywhere else, so the terminal text shows through. */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: STAGE_W,
            height: STAGE_H,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}
