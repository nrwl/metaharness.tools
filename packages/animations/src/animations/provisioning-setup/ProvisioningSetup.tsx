import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useInView } from '../../lib/canvas';
import { usePalette, useThemeMode } from '../../lib/theme';
import {
  CLAUDE,
  CONSOLE_FONT,
  consoleVars,
  Cursor,
  easeInOutCubic,
  easeOutCubic,
  FPS,
  FrameProvider,
  interpolate,
  Mono,
  POLY,
  useFrame,
  useTyped,
} from './terminal';
import commitMono400 from './fonts/commit-mono-400.woff2?url';
import commitMono700 from './fonts/commit-mono-700.woff2?url';

/**
 * Provisioning & setup: a Claude Code console types a cross-repo task, then the
 * terminal transforms into the Polygraph provisioning view — the selected repos
 * clone into isolated worktrees (git progress ramping to a green check), the
 * session-started summary fills in, and the prompt window lands ready. A DOM/React
 * port of the `ConsoleDemoDark` + `PolygraphSessionStart` Remotion clips, driven
 * by a looping rAF clock (frozen off-screen and while `seek` is set).
 */
export interface ProvisioningSetupProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze on a specific frame (0..CYCLE) instead of animating — for stories. */
  seek?: number;
}

// --- design stage (16:9); everything is laid out in these logical px and
// uniformly scaled to the container width. ---
const STAGE_W = 960;
const STAGE_H = 540;

// --- timeline (virtual 30fps) ---
const INTRO = 12; // card fade + scale in
const TYPE_START = 18; // prompt starts typing
const PROMPT = 'Implement order cancellation across all repos';
const SUBMIT = 84; // prompt lifts into a highlighted row
const FETCH = SUBMIT + 16; // "Invoking the meta-harness to fetch the repos…"
const PROVISION = FETCH + 46; // fetch resolves; "Provisioning repos…" (lingers)
const XFORM = PROVISION + 52; // terminal transforms: agent column opens
const XFORM_DUR = 26;
const CLONE_START = XFORM + 20; // repos begin cloning
const SESSION_ROWS = XFORM + 30; // "Session started" rows fill in
const READY = CLONE_START + 108; // panes green; prompt window ready
const HOLD_END = READY + 54;
const FADE = [HOLD_END, HOLD_END + 26] as const;
export const CYCLE = 408; // ~13.6s loop

const SESSION_ID = 'impl-cancel-order-568d33ca';
const REPO_ROOT = `~/.polygraph/sessions/${SESSION_ID}`;

// git-clone ramp (frames)
const CLONE_HEAD = 10;
const CLONE_RAMP = 46;
const CLONE_DELTA = 14;
const CLONE_TOTAL = CLONE_HEAD + CLONE_RAMP + CLONE_DELTA;

interface Pane {
  repo: string;
  clone: number;
  objs: number;
  deltas: number;
}
const PANES: Pane[] = [
  { repo: 'myorg/poly-ms-products', clone: CLONE_START, objs: 18, deltas: 4 },
  {
    repo: 'myorg/poly-ms-orders',
    clone: CLONE_START + 14,
    objs: 21,
    deltas: 5,
  },
  {
    repo: 'myorg/poly-ms-gateway',
    clone: CLONE_START + 28,
    objs: 10,
    deltas: 2,
  },
];

// pixel mascot for the Claude Code header
const MASCOT = [
  '..X..X..',
  'XXXXXXXX',
  'XXOXXOXX',
  'XXXXXXXX',
  '.XXXXXX.',
  '.X.XX.X.',
];
const Mascot: React.FC<{ accent: string; cell?: number }> = ({
  accent,
  cell = 7,
}) => (
  <svg
    width={MASCOT[0].length * cell}
    height={MASCOT.length * cell}
    style={{ display: 'block', shapeRendering: 'crispEdges', flex: 'none' }}
  >
    {MASCOT.flatMap((row, r) =>
      row
        .split('')
        .map((c, x) =>
          c === '.' ? null : (
            <rect
              key={`${r}-${x}`}
              x={x * cell}
              y={r * cell}
              width={cell}
              height={cell}
              // `fill` presentation attribute can't resolve var(); use style.
              // The eye stays a fixed near-black — reads on the coral mascot in
              // both themes.
              style={{ fill: c === 'O' ? '#171310' : accent }}
            />
          ),
        ),
    )}
  </svg>
);

// ---------------------------------------------------------------------------
// Phase 1 — Claude Code console
// ---------------------------------------------------------------------------
const ClaudeHeader: React.FC = () => (
  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
    <Mascot accent={CLAUDE.accent} />
    <div style={{ lineHeight: 1.4, fontFamily: CONSOLE_FONT, fontSize: 15 }}>
      <div style={{ color: CLAUDE.text }}>
        <span style={{ fontWeight: 700 }}>Claude Code</span>{' '}
        <span style={{ color: CLAUDE.muted }}>v2.1</span>
      </div>
      <div style={{ color: CLAUDE.muted }}>
        Opus 4.8 with high effort · Claude Max
      </div>
      <div style={{ color: CLAUDE.muted }}>~/code/acme</div>
    </div>
  </div>
);

const reveal = (frame: number, at: number, dur = 12): CSSProperties => ({
  opacity: interpolate(frame, [at, at + dur], [0, 1]),
  transform: `translateY(${interpolate(frame, [at, at + dur], [8, 0])}px)`,
});

// pulsing dot -> star spinner glyph (the TUI "working" indicator)
const STAR_CYCLE = ['·', '✢', '✦', '✶', '✻', '✶', '✦', '✢'];
const StarSpinner: React.FC<{ color: string }> = ({ color }) => {
  const frame = useFrame();
  return (
    <span
      style={{
        color,
        width: '1ch',
        display: 'inline-block',
        textAlign: 'center',
      }}
    >
      {STAR_CYCLE[Math.floor(frame / 3) % STAR_CYCLE.length]}
    </span>
  );
};

const ClaudeBody: React.FC = () => {
  const frame = useFrame();
  if (frame < SUBMIT) return null;
  const fetched = frame >= PROVISION;
  return (
    <div style={{ fontFamily: CONSOLE_FONT, fontSize: 15, color: CLAUDE.text }}>
      {/* submitted prompt lifted into a highlighted row */}
      <div
        style={{
          ...reveal(frame, SUBMIT),
          background: CLAUDE.promptHighlight,
          borderRadius: 8,
          padding: '5px 9px',
          margin: '-3px -9px',
        }}
      >
        <span style={{ color: CLAUDE.muted, marginRight: 8 }}>›</span>
        {PROMPT}
      </div>

      {/* step 1: invoke the meta-harness to fetch the relevant repos */}
      <div
        style={{
          ...reveal(frame, FETCH),
          marginTop: 16,
          display: 'flex',
          gap: 10,
        }}
      >
        {fetched ? (
          <span style={{ color: CLAUDE.success }}>✓</span>
        ) : (
          <StarSpinner color={CLAUDE.accent} />
        )}
        <span style={{ color: fetched ? CLAUDE.muted : CLAUDE.text }}>
          {fetched
            ? 'Fetched 3 repositories across the org'
            : 'Invoking the meta-harness to fetch the relevant repos…'}
        </span>
      </div>

      {/* step 2: provision the repos (lingers before the transform) */}
      <div
        style={{
          ...reveal(frame, PROVISION),
          marginTop: 12,
          display: 'flex',
          gap: 10,
        }}
      >
        <StarSpinner color={CLAUDE.accent} />
        <span style={{ color: CLAUDE.accent }}>Provisioning repos…</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Phase 2 — Polygraph provisioning (left summary)
// ---------------------------------------------------------------------------
const SessionStarted: React.FC = () => {
  const frame = useFrame();
  const local = frame - SESSION_ROWS;
  const rows: { t: ReactNode; at: number }[] = [
    {
      t: (
        <>
          <span style={{ color: POLY.green }}>✓ </span>
          <span style={{ fontWeight: 700 }}>Session started</span>
        </>
      ),
      at: 4,
    },
    {
      t: (
        <>
          <span style={{ color: POLY.muted }}>Title: </span>impl-cancel-order
        </>
      ),
      at: 30,
    },
    {
      t: (
        <>
          <span style={{ color: POLY.muted }}>Session ID: </span>
          <span style={{ color: POLY.amber }}>{SESSION_ID}</span>
        </>
      ),
      at: 38,
    },
    {
      t: (
        <>
          <span style={{ color: POLY.muted }}>Session root: </span>
          {REPO_ROOT}
        </>
      ),
      at: 46,
    },
    {
      t: (
        <span style={{ color: POLY.muted }}>
          Verifying Polygraph plugin installation…
        </span>
      ),
      at: 58,
    },
  ];
  return (
    <div>
      {rows.map((r, i) => (
        <Mono
          key={i}
          size={i === 0 ? 20 : 15}
          color={POLY.text}
          style={{
            opacity: interpolate(local, [r.at, r.at + 6], [0, 1]),
            marginBottom: i === 0 ? 14 : 3,
          }}
        >
          {r.t}
        </Mono>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Agent panes (right column) — repos cloning into worktrees
// ---------------------------------------------------------------------------
const cloneLine = (local: number, objs: number, deltas: number): ReactNode => {
  if (local < 0)
    return <span style={{ color: POLY.faint }}>queued · setup</span>;
  if (local < CLONE_HEAD)
    return (
      <span style={{ color: POLY.muted }}>{`Cloning into worktree…`}</span>
    );
  const recv = local - CLONE_HEAD;
  if (recv < CLONE_RAMP) {
    const pct = Math.round((recv / CLONE_RAMP) * 100);
    const n = Math.round((pct / 100) * objs);
    return (
      <span
        style={{ color: POLY.muted }}
      >{`Receiving objects: ${pct}% (${n}/${objs})`}</span>
    );
  }
  const dPct = Math.min(
    100,
    Math.round(((recv - CLONE_RAMP) / CLONE_DELTA) * 100),
  );
  const dn = Math.round((dPct / 100) * deltas);
  const done = dPct >= 100;
  if (done)
    return (
      <span style={{ color: POLY.green }}>✓ worktree ready · setup ✓</span>
    );
  return (
    <span
      style={{ color: POLY.muted }}
    >{`Resolving deltas: ${dPct}% (${dn}/${deltas})`}</span>
  );
};

const AgentPane: React.FC<{ pane: Pane; appear: number }> = ({
  pane,
  appear,
}) => {
  const frame = useFrame();
  const local = frame - pane.clone;
  const done = local >= CLONE_TOTAL;
  const o = interpolate(frame, [appear, appear + 12], [0, 1]);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        borderTop: `1px solid ${POLY.border}`,
        padding: '13px 18px',
        opacity: o,
        boxSizing: 'border-box',
      }}
    >
      <Mono color={POLY.text} size={14}>
        <span style={{ color: done ? POLY.green : POLY.amber }}>
          {done ? '✓ ' : '● '}
        </span>
        <span style={{ fontWeight: 700 }}>{pane.repo}</span>
      </Mono>
      <Mono size={13} style={{ marginTop: 5 }}>
        {cloneLine(local, pane.objs, pane.deltas)}
      </Mono>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Bottom input row (shared) — typed prompt, then the ready prompt window
// ---------------------------------------------------------------------------
const InputRow: React.FC<{
  typed: string;
  typing: boolean;
  ready: boolean;
}> = ({ typed, typing, ready }) => {
  const frame = useFrame();
  return (
    <div style={{ flex: 'none' }}>
      <div
        style={{
          borderTop: `1px solid ${ready ? POLY.rule : CLAUDE.rule}`,
          padding: '13px 0',
          fontFamily: CONSOLE_FONT,
          fontSize: 15,
          color: ready ? POLY.text : CLAUDE.text,
          whiteSpace: 'pre',
        }}
      >
        <span
          style={{ color: ready ? POLY.muted : CLAUDE.muted, marginRight: 8 }}
        >
          ❯
        </span>
        {typing ? typed : ''}
        <Cursor color={ready ? POLY.text : CLAUDE.cursor} blink={!typing} />
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: CONSOLE_FONT,
          fontSize: 12,
          color: POLY.faint,
          opacity: interpolate(frame, [READY, READY + 14], [0, 1]),
        }}
      >
        poly-ms-frontend · Opus 4.8 (1M context) · 95%
        <span style={{ marginLeft: 22, color: POLY.muted }}>
          ● high · /effort
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const Scene: React.FC = () => {
  const frame = useFrame();
  const tw = useTyped(PROMPT, { startFrame: TYPE_START, cps: 27 });
  const typingPrompt = frame < SUBMIT;

  const appear = interpolate(frame, [0, INTRO], [0, 1], {
    easing: easeOutCubic,
  });
  const cycleFade = interpolate(frame, [FADE[0], FADE[1]], [1, 0]);
  const A = appear * cycleFade;
  const introScale = interpolate(frame, [0, INTRO], [0.98, 1], {
    easing: easeOutCubic,
  });

  const xform = interpolate(frame, [XFORM, XFORM + XFORM_DUR], [0, 1], {
    easing: easeInOutCubic,
  });
  const rightW = xform * 342; // agent column opens from 0

  return (
    <div
      style={{
        width: STAGE_W,
        height: STAGE_H,
        opacity: A,
        transform: `scale(${introScale})`,
        transformOrigin: '50% 46%',
      }}
    >
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          boxSizing: 'border-box',
          display: 'flex',
          background: CLAUDE.bg,
          border: `1px solid ${CLAUDE.border}`,
          boxShadow: CLAUDE.shadow,
          borderRadius: 16,
          overflow: 'hidden',
          fontFamily: CONSOLE_FONT,
        }}
      >
        {/* left pane */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            padding: 26,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* header / summary area (cross-dissolve claude -> polygraph) */}
          <div style={{ position: 'relative', flex: 'none', minHeight: 58 }}>
            <div style={{ opacity: 1 - xform }}>
              <ClaudeHeader />
            </div>
            <div style={{ position: 'absolute', inset: 0, opacity: xform }}>
              {frame >= SESSION_ROWS - 4 ? <SessionStarted /> : null}
            </div>
          </div>

          {/* body */}
          <div
            style={{ flex: 1, minHeight: 0, marginTop: 18, opacity: 1 - xform }}
          >
            <ClaudeBody />
          </div>

          {/* shared input row */}
          <InputRow
            typed={tw.shown}
            typing={typingPrompt}
            ready={frame >= XFORM}
          />
        </div>

        {/* agent column */}
        <div
          style={{
            width: rightW,
            height: '100%',
            flex: 'none',
            borderLeft: rightW > 1 ? `1px solid ${POLY.border}` : 'none',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              width: 342,
              height: '100%',
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {PANES.map((pane, i) => (
              <AgentPane key={pane.repo} pane={pane} appear={XFORM + i * 4} />
            ))}
          </div>
        </div>
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
    if (!active) return; // freeze at the current frame
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

export function ProvisioningSetup({
  className,
  style,
  seek,
}: ProvisioningSetupProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [scale, setScale] = useState(1);
  const frame = useLoopFrame(inView, seek);
  const palette = usePalette();
  const mode = useThemeMode();

  // Project the shared console theme (consoleVars) plus the Polygraph provisioning
  // palette into the terminal's `--pv-*` custom properties; the CLAUDE/POLY token
  // objects reference these, so both terminal themes flip with the site toggle.
  // The single card is styled from CLAUDE.bg/.border/.shadow (below), so the
  // provisioning content shares the console's warm-neutral surface.
  const vars = {
    ...consoleVars(mode),
    '--pv-pg-amber': palette.statusWarn,
    '--pv-pg-text': palette.textHeader,
    '--pv-pg-muted': palette.textLabel,
    '--pv-pg-faint': palette.textDim,
    '--pv-pg-green': palette.statusOk,
    '--pv-pg-border': `color-mix(in srgb, ${palette.statusWarn} 16%, transparent)`,
    '--pv-pg-rule': palette.line,
  } as CSSProperties;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / STAGE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...vars,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        // no overflow clip — the card fills the stage, so its drop shadow must
        // fall outside the root onto the page (the card clips its own children).
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        ...style,
      }}
      aria-label="A meta-harness provisioning repositories: cloning into isolated worktrees and starting a session"
    >
      <style>{`
        @font-face {
          font-family: 'Commit Mono';
          src: url(${commitMono400}) format('woff2');
          font-weight: 400;
          font-style: normal;
          font-display: block;
        }
        @font-face {
          font-family: 'Commit Mono';
          src: url(${commitMono700}) format('woff2');
          font-weight: 700;
          font-style: normal;
          font-display: block;
        }
      `}</style>
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <FrameProvider value={frame}>
          <Scene />
        </FrameProvider>
      </div>
    </div>
  );
}
