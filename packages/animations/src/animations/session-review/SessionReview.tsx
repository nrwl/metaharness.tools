import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useInView } from '../../lib/canvas';
import type { VizPalette } from '../../lib/palette';
import { useStageScale } from '../../lib/stage';
import { usePalette, useThemeMode } from '../../lib/theme';
import {
  CLAUDE,
  CONSOLE_FONT,
  consoleVars,
  FPS,
  FrameProvider,
  interpolate,
  useFrame,
} from '../provisioning-setup/terminal';
import commitMono400 from '../provisioning-setup/fonts/commit-mono-400.woff2?url';
import commitMono700 from '../provisioning-setup/fonts/commit-mono-700.woff2?url';

/**
 * Interactive review sessions. The console you are sitting at is the reviewing
 * agent: you ask it about a change, it resumes the session that produced it,
 * and the session comes up as a card alongside. Each question travels out to
 * that session and each answer is funnelled back into the terminal, so the
 * round trip is visible rather than implied. Then a follow-up goes the same way.
 *
 * The terminal is resting state: its chrome is always on screen and only the
 * transcript, the card and the traffic between them play. The loop cuts back to
 * an empty prompt rather than fading out through the page background.
 */
export interface SessionReviewProps {
  className?: string;
  style?: CSSProperties;
}

const STAGE_W = 900;
const STAGE_H = 384;

const TERM_W = 520;
const CARD_X = 592;
const CARD_W = 308;
const CARD_Y = 82;

// Where the wire leaves the terminal and where it meets the card.
const WIRE_A = { x: TERM_W, y: 214 };
const WIRE_B = { x: CARD_X, y: CARD_Y + 96 };

// --- timeline (virtual 30fps) ---------------------------------------------
const AT = {
  q1: 14, // typing the review request
  q1Submit: 68,
  tool: 78, // polygraph - resume_session(...)
  card: [92, 122] as const, // the session comes up alongside
  toolDone: 126,
  back1: [132, 168] as const, // the answer funnels back
  a1: 168,
  a1End: 224,
  q2: 250, // the follow-up
  q2Submit: 296,
  out2: [302, 338] as const, // the follow-up travels out
  back2: [342, 378] as const, // and its answer comes back
  a2: 378,
  a2End: 440,
} as const;
const CYCLE = 530;

const Q1 = 'review the session behind the cache swap';
const A1 =
  'It swaps the in-process LRU in front of the search index for a TTL cache keyed by query hash.';
const Q2 = 'why not just tune the LRU?';
const A2 =
  'A bigger ceiling was tried first and OOM’d at 40k keys in staging. Dropping the cache took p95 from 40ms to 900ms.';

const ROW: CSSProperties = {
  display: 'flex',
  gap: 8,
  fontFamily: CONSOLE_FONT,
  fontSize: 14,
  lineHeight: 1.55,
};

const rise = (frame: number, at: number): CSSProperties => ({
  opacity: interpolate(frame, [at, at + 9], [0, 1]),
  transform: `translateY(${interpolate(frame, [at, at + 9], [5, 0])}px)`,
});

function typed(text: string, frame: number, from: number, to: number): string {
  const n = Math.round(interpolate(frame, [from, to], [0, text.length]));
  return text.slice(0, Math.max(0, Math.min(text.length, n)));
}

const STAR = ['·', '✢', '✦', '✶', '✻', '✶', '✦', '✢'];
const Spinner: React.FC = () => {
  const frame = useFrame();
  return (
    <span
      style={{
        color: CLAUDE.accent,
        width: '1ch',
        display: 'inline-block',
        textAlign: 'center',
      }}
    >
      {STAR[Math.floor(frame / 3) % STAR.length]}
    </span>
  );
};

// ---------------------------------------------------------------------------
// The wire between the terminal and the session, and the traffic on it.
// ---------------------------------------------------------------------------
const C1 = { x: WIRE_A.x + 34, y: WIRE_A.y };
const C2 = { x: WIRE_B.x - 34, y: WIRE_B.y };
const WIRE_D = `M${WIRE_A.x} ${WIRE_A.y} C ${C1.x} ${C1.y}, ${C2.x} ${C2.y}, ${WIRE_B.x} ${WIRE_B.y}`;

/** Point along the wire at t (0 = terminal, 1 = session). */
function onWire(t: number): { x: number; y: number } {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * WIRE_A.x + b1 * C1.x + b2 * C2.x + b3 * WIRE_B.x,
    y: b0 * WIRE_A.y + b1 * C1.y + b2 * C2.y + b3 * WIRE_B.y,
  };
}

const TRIPS: { win: readonly [number, number]; toCard: boolean }[] = [
  { win: AT.back1, toCard: false },
  { win: AT.out2, toCard: true },
  { win: AT.back2, toCard: false },
];

const Wire: React.FC<{ p: VizPalette }> = ({ p }) => {
  const frame = useFrame();
  const live = interpolate(frame, [AT.card[0], AT.card[1]], [0, 1]);
  if (live <= 0.01) return null;

  const trip = TRIPS.find((t) => frame >= t.win[0] && frame <= t.win[1]);
  let dot: { x: number; y: number } | null = null;
  if (trip) {
    const u = interpolate(frame, [trip.win[0], trip.win[1]], [0, 1]);
    dot = onWire(trip.toCard ? u : 1 - u);
  }

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      width={STAGE_W}
      height={STAGE_H}
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={WIRE_D}
        stroke={p.line}
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity={live * 0.8}
      />
      {dot && (
        <>
          <circle cx={dot.x} cy={dot.y} r="7" fill={p.accent} opacity="0.16" />
          <circle cx={dot.x} cy={dot.y} r="3.2" fill={p.accent} />
        </>
      )}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// The session, come back up alongside the terminal.
// ---------------------------------------------------------------------------
const SessionCard: React.FC<{ p: VizPalette }> = ({ p }) => {
  const frame = useFrame();
  const inAmt = interpolate(frame, [AT.card[0], AT.card[1]], [0, 1]);
  if (inAmt <= 0.01) return null;
  const answering =
    (frame >= AT.back1[0] - 14 && frame <= AT.back1[1]) ||
    (frame >= AT.out2[0] && frame <= AT.back2[1]);

  return (
    <div
      style={{
        position: 'absolute',
        left: CARD_X,
        top: CARD_Y,
        width: CARD_W,
        opacity: inAmt,
        transform: `translateX(${interpolate(inAmt, [0, 1], [12, 0])}px)`,
        background: p.cardFill,
        border: `1px solid ${p.accent}`,
        borderRadius: 12,
        boxSizing: 'border-box',
        padding: '14px 16px',
        fontFamily: CONSOLE_FONT,
      }}
    >
      <div style={{ fontSize: 11, color: p.textDim, letterSpacing: '0.06em' }}>
        SESSION
      </div>
      <div
        style={{
          marginTop: 7,
          fontSize: 14,
          fontWeight: 700,
          color: p.textHeader,
        }}
      >
        migrate-search-cache
      </div>
      <div style={{ marginTop: 5, fontSize: 12, color: p.textDim }}>
        leo &middot; 2 days ago
      </div>
      <div
        style={{
          marginTop: 11,
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: 999,
          border: `1px solid rgba(${p.accentRgb}, 0.4)`,
          background: `rgba(${p.accentRgb}, 0.09)`,
          fontSize: 11,
          color: p.accent,
          whiteSpace: 'nowrap',
        }}
      >
        41 messages restored
      </div>
      <div
        style={{
          marginTop: 13,
          paddingTop: 12,
          borderTop: `1px solid ${p.divider}`,
          fontSize: 12,
          lineHeight: 1.5,
          color: answering ? p.accent : p.textDim,
          display: 'flex',
          gap: 8,
        }}
      >
        {answering ? <Spinner /> : <span>&#9679;</span>}
        <span>{answering ? 'answering' : 'live · read-only'}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The terminal you are sitting at: Codex, reviewing.
// ---------------------------------------------------------------------------
const KV: React.FC<{ k: string; v: ReactNode }> = ({ k, v }) => (
  <div style={{ display: 'flex', fontSize: 12.5, lineHeight: 1.6 }}>
    <span style={{ color: CLAUDE.muted, width: 82, flex: 'none' }}>{k}</span>
    <span style={{ color: CLAUDE.text, minWidth: 0 }}>{v}</span>
  </div>
);

const Submitted: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const frame = useFrame();
  if (frame < at) return null;
  return (
    <div
      style={{
        ...ROW,
        ...rise(frame, at),
        color: CLAUDE.text,
        background: CLAUDE.promptHighlight,
        borderRadius: 6,
        padding: '5px 9px',
        margin: '-5px -9px',
      }}
    >
      <span style={{ color: CLAUDE.muted, flex: 'none' }}>&rsaquo;</span>
      <span>{text}</span>
    </div>
  );
};

const Stream: React.FC<{ text: string; at: number; end: number }> = ({
  text,
  at,
  end,
}) => {
  const frame = useFrame();
  if (frame < at) return null;
  return (
    <div style={{ ...ROW, color: CLAUDE.text }}>
      <span style={{ color: CLAUDE.muted, flex: 'none' }}>&#9679;</span>
      <span>{typed(text, frame, at, end)}</span>
    </div>
  );
};

const Terminal: React.FC = () => {
  const frame = useFrame();
  // Whatever is being typed right now lives in the prompt band at the bottom.
  const drafting =
    frame < AT.q1Submit
      ? typed(Q1, frame, AT.q1, AT.q1Submit - 4)
      : frame >= AT.q2 && frame < AT.q2Submit
        ? typed(Q2, frame, AT.q2, AT.q2Submit - 4)
        : '';
  const resuming = frame >= AT.tool && frame < AT.toolDone;
  const waiting =
    (frame >= AT.toolDone && frame < AT.a1) ||
    (frame >= AT.q2Submit && frame < AT.a2);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: TERM_W,
        height: STAGE_H,
        boxSizing: 'border-box',
        background: CLAUDE.bg,
        border: `1px solid ${CLAUDE.border}`,
        boxShadow: CLAUDE.shadow,
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: CONSOLE_FONT,
      }}
    >
      <div style={{ padding: '18px 20px 0' }}>
        <div
          style={{
            border: `1px solid ${CLAUDE.rule}`,
            borderRadius: 8,
            padding: '11px 13px',
          }}
        >
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ color: CLAUDE.muted }}>&gt;_ </span>
            <span style={{ color: CLAUDE.text, fontWeight: 700 }}>
              OpenAI Codex
            </span>{' '}
            <span style={{ color: CLAUDE.dim }}>(v0.147.0)</span>
          </div>
          <div style={{ marginTop: 9 }}>
            <KV k="model:" v="gpt-5.6-sol high" />
            <KV k="directory:" v="~/oss/search-api" />
          </div>
        </div>
      </div>

      {/* Bottom-anchored and clipped, so new output pushes earlier lines up. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 12,
        }}
      >
        <Submitted text={Q1} at={AT.q1Submit} />

        {frame >= AT.tool && (
          <div style={{ ...rise(frame, AT.tool) }}>
            <div style={{ ...ROW, color: CLAUDE.text }}>
              <span style={{ color: CLAUDE.muted, flex: 'none' }}>&#9679;</span>
              <span>
                polygraph - resume_session
                <span style={{ color: CLAUDE.muted }}>
                  (migrate-search-cache)
                </span>
              </span>
            </div>
            {resuming && (
              <div
                style={{
                  ...ROW,
                  paddingLeft: 22,
                  color: CLAUDE.dim,
                  marginTop: 1,
                }}
              >
                <Spinner />
                <span>restoring&hellip;</span>
              </div>
            )}
            {frame >= AT.toolDone && (
              <div
                style={{
                  ...ROW,
                  ...rise(frame, AT.toolDone),
                  paddingLeft: 22,
                  color: CLAUDE.dim,
                  marginTop: 1,
                }}
              >
                <span style={{ flex: 'none' }}>&#9500;</span>
                <span>session live &middot; 41 messages</span>
              </div>
            )}
          </div>
        )}

        {waiting && (
          <div style={{ ...ROW, color: CLAUDE.dim }}>
            <Spinner />
            <span>asking the session&hellip;</span>
          </div>
        )}

        <Stream text={A1} at={AT.a1} end={AT.a1End} />
        <Submitted text={Q2} at={AT.q2Submit} />
        <Stream text={A2} at={AT.a2} end={AT.a2End} />
      </div>

      <div>
        <div
          style={{
            background: CLAUDE.promptHighlight,
            padding: '9px 20px',
            display: 'flex',
            alignItems: 'baseline',
            fontSize: 14,
            lineHeight: 1.5,
            color: CLAUDE.text,
          }}
        >
          <span style={{ color: CLAUDE.muted, marginRight: '0.6em' }}>
            &rsaquo;
          </span>
          <span>{drafting}</span>
          <span
            style={{
              display: 'inline-block',
              width: '0.6em',
              height: '1.05em',
              marginLeft: 1,
              background: CLAUDE.cursor,
              opacity: 0.85,
              transform: 'translateY(0.14em)',
            }}
          />
        </div>
        <div
          style={{
            padding: '7px 20px 11px',
            fontSize: 12,
            color: CLAUDE.dim,
            lineHeight: 1.5,
          }}
        >
          gpt-5.6-sol high &middot; ~/oss/search-api
        </div>
      </div>
    </div>
  );
};

const Scene: React.FC<{ p: VizPalette }> = ({ p }) => (
  <div style={{ position: 'relative', width: STAGE_W, height: STAGE_H }}>
    <Terminal />
    <Wire p={p} />
    <SessionCard p={p} />
  </div>
);

// ---------------------------------------------------------------------------
// Looping rAF clock (gated by inView)
// ---------------------------------------------------------------------------
function useLoopFrame(active: boolean): { frame: number; total: number } {
  const [state, setState] = useState({ frame: 0, total: 0 });
  const elapsedRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      elapsedRef.current += dt;
      const total = elapsedRef.current * FPS;
      setState({ frame: total % CYCLE, total });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return state;
}

export function SessionReview({ className, style }: SessionReviewProps) {
  const { ref: viewRef, inView } = useInView<HTMLDivElement>();
  const { ref: sizeRef, scale } = useStageScale<HTMLDivElement>(STAGE_W);
  const { frame, total } = useLoopFrame(inView);
  const mode = useThemeMode();
  const p = usePalette();
  const vars = consoleVars(mode);
  const intro = Math.min(total / 12, 1);

  return (
    <div
      ref={viewRef}
      className={className}
      style={{
        ...vars,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        opacity: intro,
        ...style,
      }}
      aria-label="A Codex terminal reviewing a change: it resumes the session that produced it, the session appears alongside as a card, and each question and answer travels along the wire between them"
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
      <div ref={sizeRef} style={{ width: '100%' }}>
        <div
          style={{
            width: STAGE_W,
            height: STAGE_H,
            zoom: scale ?? 1,
            visibility: scale === null ? 'hidden' : 'visible',
          }}
        >
          <FrameProvider value={frame}>
            <Scene p={p} />
          </FrameProvider>
        </div>
      </div>
    </div>
  );
}
