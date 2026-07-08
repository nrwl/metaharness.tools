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
  easeInOutCubic,
  easeOutCubic,
  FPS,
  FrameProvider,
  interpolate,
  useFrame,
  useTyped,
} from '../provisioning-setup/terminal';
import commitMono400 from '../provisioning-setup/fonts/commit-mono-400.woff2?url';
import commitMono700 from '../provisioning-setup/fonts/commit-mono-700.woff2?url';

/**
 * Work across repositories at once: a Claude Code console shows the edits it
 * made (file diffs + a completion summary), takes a "commit and push to all
 * repos" prompt, then commits and pushes each repo in turn. As the pushes land
 * the terminal slides up and a "Pull requests · 3 across 3 repos" panel fills
 * in — one coordinated PR per repo, all on the same branch, opening together.
 *
 * Pure DOM (no canvas), reusing the ported terminal primitives + fonts from
 * ProvisioningSetup, driven by a looping virtual-frame clock (frozen off-screen
 * and while `seek` is set). Ported look for the PR panel from the Polygraph
 * SessionDetail clip.
 */
export interface CrossRepoShipProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze on a specific frame (0..CYCLE) instead of animating — for stories. */
  seek?: number;
}

// --- design stage (16:9, so it fits its column height without cropping) ---
const STAGE_W = 960;
const STAGE_H = 540;
// Terminal geometry: full working console (phases 1-4) -> a small summary card
// docked at the top (phase 5), with a connector line down to the PR panel.
const TERM_FULL = { left: 40, top: 42, width: 880, height: 456 };
const TERM_SMALL = { left: 220, top: 28, width: 520, height: 126 };
const PR_BOX = { left: 70, top: 214, width: 820, height: 214 };
const CONNECT_X = STAGE_W / 2;

// --- timeline (virtual 30fps) ---
const INTRO = 12;
const AT = {
  work: 18,
  diff: 30,
  done: 82,
  // hold on the completion summary before the next prompt is issued
  prompt: 205, // highlighted submitted-prompt line
  commit: 219,
  commitsDone: 237,
  pushF: 249,
  pushB: 267,
  pushD: 285,
} as const;
const PUSH_RESOLVE = 20; // frames after a push line appears -> ✓
const TYPE_START = 163;
const PROMPT = 'commit and push to all repos';
const SUBMIT = 205;
const SHIFT = [312, 346] as const; // terminal shrinks up; PR panel + connector appear
const PR_ROW_AT = [346, 364, 382] as const;
const FADE = [512, 544] as const;
export const CYCLE = 544;

const BRANCH = 'impl-cancel-order-568d33ca';

interface RepoDef {
  repo: string;
  title: string;
}
const REPOS: RepoDef[] = [
  {
    repo: 'myorg/poly-ms-frontend',
    title: 'feat: add order cancellation action',
  },
  { repo: 'myorg/poly-ms-backend', title: 'feat: add order cancellation API' },
  {
    repo: 'myorg/poly-ms-design-system',
    title: 'feat: add cancel-order dialog',
  },
];

// ---------------------------------------------------------------------------
// Header (Claude Code) — pixel mascot + meta lines
// ---------------------------------------------------------------------------
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
  cell = 6,
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
              fill={c === 'O' ? '#171310' : accent}
            />
          ),
        ),
    )}
  </svg>
);

const Header: React.FC = () => (
  <div
    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 'none' }}
  >
    <Mascot accent={CLAUDE.accent} />
    <div style={{ lineHeight: 1.4, fontFamily: CONSOLE_FONT, fontSize: 14 }}>
      <div style={{ color: CLAUDE.text }}>
        <span style={{ fontWeight: 700 }}>Claude Code</span>{' '}
        <span style={{ color: CLAUDE.muted }}>v2.1</span>
      </div>
      <div style={{ color: CLAUDE.muted }}>
        Opus 4.8 · working across 3 repos
      </div>
    </div>
  </div>
);

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

// reveal transform for a log entry
const reveal = (frame: number, at: number, dur = 10): CSSProperties => ({
  opacity: interpolate(frame, [at, at + dur], [0, 1]),
  transform: `translateY(${interpolate(frame, [at, at + dur], [7, 0])}px)`,
});

// ---------------------------------------------------------------------------
// Log entries (the scrolling terminal body, bottom-anchored)
// ---------------------------------------------------------------------------
const Row: React.FC<{ children: ReactNode; gap?: number }> = ({
  children,
  gap = 10,
}) => (
  <div
    style={{
      display: 'flex',
      gap,
      fontFamily: CONSOLE_FONT,
      fontSize: 14,
      color: CLAUDE.text,
    }}
  >
    {children}
  </div>
);

const DiffBlock: React.FC = () => {
  const frame = useFrame();
  const line = (bg: string, color: string, text: string) => (
    <div
      style={{
        fontFamily: CONSOLE_FONT,
        fontSize: 13,
        color,
        background: bg,
        padding: '1px 8px',
        whiteSpace: 'pre',
      }}
    >
      {text}
    </div>
  );
  const add = 'rgba(108, 194, 149, 0.10)';
  const del = 'rgba(207, 111, 111, 0.10)';
  return (
    <div style={reveal(frame, AT.diff)}>
      <div
        style={{
          color: CLAUDE.muted,
          fontFamily: CONSOLE_FONT,
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        <span style={{ color: CLAUDE.accent }}>~</span> poly-ms-backend ·
        src/orders/cancel.ts
      </div>
      <div
        style={{
          borderRadius: 6,
          overflow: 'hidden',
          border: `1px solid ${CLAUDE.rule}`,
        }}
      >
        {line(del, '#cf6b6b', '- // TODO: cancellation not implemented')}
        {line(
          add,
          '#6cc295',
          '+ export async function cancelOrder(id: string) {',
        )}
        {line(add, '#6cc295', '+   return api.post(`/orders/${id}/cancel`);')}
        {line(add, '#6cc295', '+ }')}
      </div>
      <div
        style={{
          color: CLAUDE.dim,
          fontFamily: CONSOLE_FONT,
          fontSize: 12,
          marginTop: 5,
        }}
      >
        3 files changed across 3 repos · +182 −24
      </div>
    </div>
  );
};

const DoneSummary: React.FC = () => {
  const frame = useFrame();
  const items = [
    'frontend · add cancel action + confirm dialog',
    'backend · add order cancellation API endpoint',
    'design-system · add cancel-order dialog component',
  ];
  return (
    <div style={reveal(frame, AT.done)}>
      <Row>
        <span style={{ color: CLAUDE.success }}>✓</span>
        <span style={{ fontWeight: 700 }}>
          Implemented order cancellation across 3 repos
        </span>
      </Row>
      <div style={{ marginTop: 4, paddingLeft: 24 }}>
        {items.map((t, i) => (
          <div
            key={i}
            style={{
              fontFamily: CONSOLE_FONT,
              fontSize: 13,
              color: CLAUDE.muted,
              opacity: interpolate(
                frame,
                [AT.done + 4 + i * 5, AT.done + 12 + i * 5],
                [0, 1],
              ),
            }}
          >
            <span style={{ color: CLAUDE.dim }}>· </span>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
};

const PushLine: React.FC<{ at: number; repo: string }> = ({ at, repo }) => {
  const frame = useFrame();
  const done = frame >= at + PUSH_RESOLVE;
  return (
    <Row>
      {done ? (
        <span style={{ color: CLAUDE.success }}>✓</span>
      ) : (
        <StarSpinner color={CLAUDE.accent} />
      )}
      <span style={{ color: done ? CLAUDE.muted : CLAUDE.text }}>
        {done ? (
          <>
            Pushed <span style={{ color: CLAUDE.text }}>{repo}</span>{' '}
            <span style={{ color: CLAUDE.dim }}>· {BRANCH}</span>
          </>
        ) : (
          <>Pushing to {repo}…</>
        )}
      </span>
    </Row>
  );
};

const TerminalLog: React.FC = () => {
  const frame = useFrame();
  const entries: { at: number; node: ReactNode }[] = [
    {
      at: AT.work,
      node: (
        <Row>
          <StarSpinner color={CLAUDE.accent} />
          <span>
            Editing poly-ms-frontend, poly-ms-backend, poly-ms-design-system
          </span>
        </Row>
      ),
    },
    { at: AT.diff, node: <DiffBlock /> },
    { at: AT.done, node: <DoneSummary /> },
    {
      at: AT.prompt,
      node: (
        <div
          style={{
            background: CLAUDE.promptHighlight,
            borderRadius: 8,
            padding: '5px 9px',
            margin: '2px -9px',
            fontFamily: CONSOLE_FONT,
            fontSize: 14,
            color: CLAUDE.text,
          }}
        >
          <span style={{ color: CLAUDE.muted, marginRight: 8 }}>›</span>
          {PROMPT}
        </div>
      ),
    },
    {
      at: AT.commit,
      node: (
        <div>
          <Row>
            <StarSpinner color={CLAUDE.accent} />
            <span>Committing changes in all repos</span>
          </Row>
          <div
            style={{
              fontFamily: CONSOLE_FONT,
              fontSize: 13,
              color: CLAUDE.dim,
              paddingLeft: 24,
              marginTop: 2,
              whiteSpace: 'pre',
            }}
          >
            $ git commit -am "feat: add order cancellation"
          </div>
        </div>
      ),
    },
    {
      at: AT.commitsDone,
      node: (
        <Row>
          <span style={{ color: CLAUDE.success }}>✓</span>
          <span style={{ color: CLAUDE.muted }}>
            3 commits created on {BRANCH}
          </span>
        </Row>
      ),
    },
    { at: AT.pushF, node: <PushLine at={AT.pushF} repo="poly-ms-frontend" /> },
    { at: AT.pushB, node: <PushLine at={AT.pushB} repo="poly-ms-backend" /> },
    {
      at: AT.pushD,
      node: <PushLine at={AT.pushD} repo="poly-ms-design-system" />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {entries.map((e, i) =>
        frame >= e.at ? (
          <div key={i} style={reveal(frame, e.at)}>
            {e.node}
          </div>
        ) : null,
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pull requests panel (Polygraph SessionDetail look)
// ---------------------------------------------------------------------------
const PR_TEXT = '#e9e6e1';
const PR_MUTED = '#8b877f';
const PR_DIM = '#6a6760';
const PR_GREEN = '#57ab5a';
const PR_AMBER = '#d4b483';

const PrIcon: React.FC = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill={PR_GREEN}
    style={{ flex: 'none', marginTop: 3 }}
  >
    <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
  </svg>
);

const RepoMark: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill={PR_DIM}
    style={{ flex: 'none' }}
  >
    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
  </svg>
);

const PrRow: React.FC<{ def: RepoDef; at: number; last: boolean }> = ({
  def,
  at,
  last,
}) => {
  const frame = useFrame();
  const o = interpolate(frame, [at, at + 12], [0, 1]);
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(frame * 0.09));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: last ? 'none' : `1px solid ${'rgba(255,255,255,0.06)'}`,
        opacity: o,
        transform: `translateY(${interpolate(frame, [at, at + 12], [8, 0])}px)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          minWidth: 0,
        }}
      >
        <PrIcon />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: CONSOLE_FONT,
              fontSize: 14,
              whiteSpace: 'nowrap',
            }}
          >
            <RepoMark /> <span style={{ color: PR_MUTED }}>{def.repo}</span>
            <span style={{ color: PR_DIM }}> · </span>
            <span
              style={{
                color: PR_TEXT,
                fontWeight: 700,
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              }}
            >
              {def.title}
            </span>
          </div>
          <div
            style={{
              fontFamily: CONSOLE_FONT,
              fontSize: 12,
              color: PR_DIM,
              marginTop: 3,
            }}
          >
            {BRANCH} → main · just now
          </div>
        </div>
      </div>
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: PR_AMBER,
            opacity: pulse,
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: CONSOLE_FONT,
            fontSize: 13,
            color: PR_MUTED,
            whiteSpace: 'nowrap',
          }}
        >
          CI · In progress
        </span>
      </div>
    </div>
  );
};

const PullRequests: React.FC = () => {
  const frame = useFrame();
  const count = PR_ROW_AT.filter((a) => frame >= a).length;
  return (
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        background: '#0c0b0a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flex: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              fontSize: 15,
              fontWeight: 700,
              color: PR_TEXT,
            }}
          >
            Pull requests
          </span>
          <span
            style={{ fontFamily: CONSOLE_FONT, fontSize: 12, color: PR_MUTED }}
          >
            {count} across {count} repos
          </span>
        </div>
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke={PR_DIM}
          strokeWidth="1.6"
        >
          <path d="M13.6 8a5.6 5.6 0 1 1-1.3-3.6" strokeLinecap="round" />
          <path
            d="M13.8 2.2v3.2h-3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        {REPOS.map((def, i) => (
          <PrRow
            key={def.repo}
            def={def}
            at={PR_ROW_AT[i]}
            last={i === REPOS.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const Scene: React.FC = () => {
  const frame = useFrame();
  const tw = useTyped(PROMPT, { startFrame: TYPE_START, cps: 26 });
  const typing = frame < SUBMIT;

  const appear = interpolate(frame, [0, INTRO], [0, 1], {
    easing: easeOutCubic,
  });
  const fade = interpolate(frame, [FADE[0], FADE[1]], [1, 0]);

  // shrink progress: full working console (0) -> small summary card (1)
  const sp = interpolate(frame, SHIFT, [0, 1], { easing: easeInOutCubic });
  const g = (a: number, b: number) => a + (b - a) * sp;
  const termLeft = g(TERM_FULL.left, TERM_SMALL.left);
  const termTop = g(TERM_FULL.top, TERM_SMALL.top);
  const termW = g(TERM_FULL.width, TERM_SMALL.width);
  const termH = g(TERM_FULL.height, TERM_SMALL.height);

  const fullOpacity = interpolate(sp, [0, 0.45], [1, 0]);
  const summaryOpacity = interpolate(sp, [0.55, 1], [0, 1]);
  const connectOpacity = interpolate(
    frame,
    [SHIFT[1] - 8, SHIFT[1] + 8],
    [0, 1],
  );
  const prReveal = interpolate(frame, [SHIFT[1] - 6, SHIFT[1] + 14], [0, 1]);

  const connectTop = TERM_SMALL.top + TERM_SMALL.height;
  const connectH = PR_BOX.top - connectTop;

  return (
    <div
      style={{
        width: STAGE_W,
        height: STAGE_H,
        opacity: appear * fade,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* connector: small terminal -> PR panel */}
      <div
        style={{
          position: 'absolute',
          left: CONNECT_X - 0.5,
          top: connectTop,
          width: 1,
          height: connectH,
          background: 'rgba(212, 180, 131, 0.4)',
          opacity: connectOpacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: CONNECT_X - 3,
          top: PR_BOX.top - 4,
          width: 6,
          height: 6,
          borderRight: '1px solid rgba(212, 180, 131, 0.6)',
          borderBottom: '1px solid rgba(212, 180, 131, 0.6)',
          transform: 'rotate(45deg)',
          opacity: connectOpacity,
        }}
      />

      {/* terminal card: geometry animates from full console to compact summary */}
      <div
        style={{
          position: 'absolute',
          left: termLeft,
          top: termTop,
          width: termW,
          height: termH,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          padding: g(24, 15),
          background: CLAUDE.bg,
          border: `1px solid ${CLAUDE.border}`,
          borderRadius: 14,
          overflow: 'hidden',
          fontFamily: CONSOLE_FONT,
        }}
      >
        <Header />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            marginTop: 12,
          }}
        >
          {/* full log + input row, bottom-anchored; fades out as it shrinks */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              opacity: fullOpacity,
            }}
          >
            <TerminalLog />
            <div
              style={{
                borderTop: `1px solid ${CLAUDE.rule}`,
                paddingTop: 12,
                marginTop: 12,
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

          {/* compact summary shown in the small card */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 4,
              opacity: summaryOpacity,
              fontFamily: CONSOLE_FONT,
            }}
          >
            <div style={{ fontSize: 14, color: CLAUDE.text }}>
              <span style={{ color: CLAUDE.success, marginRight: 8 }}>✓</span>
              <span style={{ fontWeight: 700 }}>
                Committed &amp; pushed to 3 repos
              </span>
            </div>
            <div style={{ fontSize: 12, color: CLAUDE.muted, paddingLeft: 24 }}>
              {BRANCH} → main
            </div>
          </div>
        </div>
      </div>

      {/* PR panel */}
      <div
        style={{
          position: 'absolute',
          left: PR_BOX.left,
          top: PR_BOX.top,
          width: PR_BOX.width,
          height: PR_BOX.height,
          opacity: prReveal,
        }}
      >
        <PullRequests />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Looping rAF clock
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

export function CrossRepoShip({ className, style, seek }: CrossRepoShipProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [scale, setScale] = useState(1);
  const frame = useLoopFrame(inView, seek);

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
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        ...style,
      }}
      aria-label="Claude Code committing and pushing changes across three repositories, opening a coordinated pull request in each"
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
