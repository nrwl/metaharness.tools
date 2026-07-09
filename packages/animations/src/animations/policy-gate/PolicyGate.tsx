import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useInView } from '../../lib/canvas';
import { usePalette, useThemeMode } from '../../lib/theme';
import {
  consoleTheme,
  CONSOLE_FONT,
  Cursor,
  easeOutCubic,
  FPS,
  FrameProvider,
  interpolate,
  Mono,
  useFrame,
  useTyped,
} from '../provisioning-setup/terminal';
import commitMono400 from '../provisioning-setup/fonts/commit-mono-400.woff2?url';
import commitMono700 from '../provisioning-setup/fonts/commit-mono-700.woff2?url';

/**
 * Organizational rules and policies: a real Claude Code session (the underlying
 * harness) is physically wired to a "policy hook" box on the side — the
 * meta-harness layer. The agent types a task prompt and works through it,
 * emitting its normal tool-call lines. Every policy-relevant action (installing a
 * package, pushing, fetching an external host, writing secrets) fires a connector
 * out to the hook, where it is matched against the org's ruleset (fetched from a
 * shared registry) and comes back stamped allow / deny / transform. Denied actions
 * push a reason back so the agent re-plans into an approved command. A DOM/React
 * scene on a looping rAF clock, sharing the ProvisioningSetup terminal primitives
 * (frozen off-screen and while `seek` is set).
 */
export interface PolicyGateProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze on a specific frame (0..CYCLE) instead of animating — for stories. */
  seek?: number;
}

// --- design stage (16:9); laid out in logical px and uniformly scaled. ---
const STAGE_W = 960;
const STAGE_H = 540;

// --- geometry ---
const TERM_W = 556;
const HOOK_X = 648;
const HOOK_W = 296;
const HOOK_TOP = 168;
const HOOK_H = 220;
const HOOK_PORT_Y = HOOK_TOP + HOOK_H / 2;
const STEPS_TOP = 150;
const STEP_H = 28;
const NOTE_H = 21;
const STEP_GAP = 9;

// --- verdict palette (semantic tokens, projected as CSS custom properties) ---
const ALLOW = 'var(--pg-ok)';
const DENY = 'var(--pg-error)';
const XFORM = 'var(--pg-warn)';

type Verdict = 'allow' | 'deny' | 'transform';

interface Step {
  /** Routed through the policy hook (true) or a plain agent action (false). */
  gated: boolean;
  /** Tool name for gated lines, e.g. Bash / Fetch / Write. */
  tool?: string;
  /** The command/arg (gated) or the completed sentence (work). */
  text: string;
  /** Spinner-phase sentence for work lines (defaults to `text`). */
  runText?: string;
  // gated evaluation
  rule?: string;
  detail?: string;
  verdict?: Verdict;
  /** Follow-up line shown after a denied verdict (the agent adapting). */
  note?: string;
  /** Frames this step occupies before the next begins. */
  dur: number;
}

const WORK = 28;
const GATED = 48;
const GATED_NOTE = 62;

const PROMPT = 'Implement order cancellation across all repos';

const STEPS: Step[] = [
  {
    gated: false,
    text: 'Fetched 3 repositories across the org',
    runText: 'Fetching repositories across the org',
    dur: WORK,
  },
  {
    gated: true,
    tool: 'Bash',
    text: 'npm install left-pad',
    rule: 'dependency allowlist',
    detail: 'unapproved dependency',
    verdict: 'deny',
    note: 'agent re-plans → use @acme/pad',
    dur: GATED_NOTE,
  },
  {
    gated: true,
    tool: 'Bash',
    text: 'npm install @acme/pad',
    rule: 'dependency allowlist',
    detail: 'approved · pinned 2.4.0',
    verdict: 'allow',
    dur: GATED,
  },
  {
    gated: true,
    tool: 'Fetch',
    text: 'api.stripe.com/charges',
    rule: 'egress · secrets',
    detail: 'token injected at egress',
    verdict: 'transform',
    dur: GATED,
  },
  {
    gated: true,
    tool: 'Write',
    text: 'prod/config/secrets.env',
    rule: 'write scope',
    detail: 'path outside write scope',
    verdict: 'deny',
    note: 'agent re-plans → scope to feat/orders',
    dur: GATED_NOTE,
  },
  {
    gated: true,
    tool: 'Bash',
    text: 'git push origin feat/orders',
    rule: 'branch protection',
    detail: 'reviewed · CI green',
    verdict: 'allow',
    dur: GATED,
  },
  {
    gated: false,
    text: 'Opened coordinated PR across 3 repos',
    runText: 'Opening coordinated PR',
    dur: WORK,
  },
];
const N = STEPS.length;

// --- timeline (virtual 30fps) ---
const TYPE_START = 16;
const SUBMIT = 74; // prompt lifts into a highlighted row
const STEPS_START = SUBMIT + 14;
// per-step relative beats (gated)
const G_OUT = 8; // connector draws, out-pulse leaves the row
const G_HOOK = 16; // hook activates, rule matching begins
const G_VERDICT = 30; // verdict resolves, return-pulse leaves the hook
const G_STAMP = 40; // row stamped with the verdict
const G_NOTE = 50; // deny follow-up: agent re-plans
// per-step relative beats (work)
const W_DONE = 12; // spinner resolves to a check

// step start frames + connector anchors (deterministic)
const START: number[] = [];
const STEP_TOP: number[] = [];
const ANCHOR_Y: number[] = [];
{
  let f = STEPS_START;
  let y = STEPS_TOP;
  STEPS.forEach((s, i) => {
    START[i] = f;
    STEP_TOP[i] = y;
    ANCHOR_Y[i] = y + STEP_H / 2;
    f += s.dur;
    y += STEP_H + (s.note ? NOTE_H : 0) + STEP_GAP;
  });
}
const LAST_END = START[N - 1] + STEPS[N - 1].dur;
const HOLD_END = LAST_END + 30;
const FADE = [HOLD_END, HOLD_END + 24] as const;
export const CYCLE = HOLD_END + 30; // ~15s loop

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const verdictColor = (v: Verdict) =>
  v === 'allow' ? ALLOW : v === 'deny' ? DENY : XFORM;
const verdictGlyph = (v: Verdict) =>
  v === 'allow' ? '✓' : v === 'deny' ? '✗' : '⇄';
const verdictLabel = (v: Verdict) =>
  v === 'allow' ? 'allow' : v === 'deny' ? 'deny' : 'transform';

// pulsing star spinner (the TUI "working" glyph)
const STAR = ['·', '✢', '✦', '✶', '✻', '✶', '✦', '✢'];
const Spinner: React.FC<{ color: string }> = ({ color }) => {
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
      {STAR[Math.floor(frame / 3) % STAR.length]}
    </span>
  );
};

// pixel mascot for the Claude Code header (shared look with ProvisioningSetup)
const Mascot: React.FC<{ accent: string; cell?: number }> = ({
  accent,
  cell = 6,
}) => (
  <svg
    width={cell * 6}
    height={cell * 6}
    viewBox="0 0 24 24"
    style={{ display: 'block', flex: 'none' }}
  >
    {/* Official Claude Code mark; body fill via style so an accent var() resolves. */}
    <path
      d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949z"
      style={{ fill: accent }}
    />
    {/* Solid near-black eyes: the official mark cuts these out, but a light
        console bg would swallow the cut-outs, so draw them explicitly. */}
    <rect x="6" y="8.102" width="1.488" height="2.847" fill="#171310" />
    <rect x="16.51" y="8.102" width="1.49" height="2.847" fill="#171310" />
  </svg>
);

// ---------------------------------------------------------------------------
// Terminal header — the underlying harness, visibly wrapped by the meta-harness
// ---------------------------------------------------------------------------
const Header: React.FC = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
    <Mascot accent="var(--pg-accent)" />
    <div style={{ lineHeight: 1.4, fontFamily: CONSOLE_FONT, fontSize: 14 }}>
      <div style={{ color: 'var(--pg-text)' }}>
        <span style={{ fontWeight: 700 }}>Claude Code</span>{' '}
        <span style={{ color: 'var(--pg-muted)' }}>
          · wrapped by acme meta-harness
        </span>
      </div>
      <div style={{ color: 'var(--pg-muted)' }}>
        every action checked against org policy
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Prompt row — typed, then lifted into a highlighted submitted row
// ---------------------------------------------------------------------------
const PromptRow: React.FC = () => {
  const frame = useFrame();
  const tw = useTyped(PROMPT, { startFrame: TYPE_START, cps: 27 });
  const submitted = frame >= SUBMIT;
  return (
    <div
      style={{
        position: 'absolute',
        top: 88,
        left: 22,
        right: 20,
        fontFamily: CONSOLE_FONT,
        fontSize: 14.5,
        whiteSpace: 'pre-wrap',
        color: 'var(--pg-text)',
        background: submitted
          ? 'color-mix(in srgb, var(--pg-text) 6%, transparent)'
          : 'transparent',
        borderRadius: 8,
        padding: '6px 9px',
        margin: '0 -9px',
      }}
    >
      <span style={{ color: 'var(--pg-muted)', marginRight: 8 }}>›</span>
      {submitted ? PROMPT : tw.shown}
      {submitted ? null : <Cursor color="var(--pg-text)" />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// One step line — a plain agent action, or a policy-gated tool call
// ---------------------------------------------------------------------------
const Line: React.FC<{ step: Step; index: number }> = ({ step, index }) => {
  const frame = useFrame();
  const local = frame - START[index];
  if (local < -6) return null;

  const appear = interpolate(local, [0, 8], [0, 1]);
  const y = interpolate(local, [0, 8], [6, 0]);
  const wrap: CSSProperties = {
    position: 'absolute',
    top: STEP_TOP[index],
    left: 26,
    right: 22,
    opacity: appear,
    transform: `translateY(${y}px)`,
    fontFamily: CONSOLE_FONT,
    fontSize: 14.5,
    color: 'var(--pg-text)',
    whiteSpace: 'pre',
  };

  if (!step.gated) {
    const done = local >= W_DONE;
    return (
      <div style={wrap}>
        {done ? (
          <span style={{ color: 'var(--pg-ok)' }}>✓</span>
        ) : (
          <Spinner color="var(--pg-accent)" />
        )}
        <span
          style={{
            marginLeft: 8,
            color: done ? 'var(--pg-muted)' : 'var(--pg-text)',
          }}
        >
          {done ? step.text : (step.runText ?? step.text)}
        </span>
      </div>
    );
  }

  const stamped = local >= G_STAMP;
  const color = verdictColor(step.verdict!);
  return (
    <div style={wrap}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span>
          <span
            style={{
              color: stamped ? color : 'var(--pg-accent)',
              marginRight: 9,
            }}
          >
            ●
          </span>
          <span style={{ fontWeight: 700 }}>{step.tool}</span>
          <span style={{ color: 'var(--pg-muted)' }}>({step.text})</span>
        </span>
        <span style={{ flex: 'none', fontWeight: 700 }}>
          {stamped ? (
            <span style={{ color }}>
              {verdictGlyph(step.verdict!)} {verdictLabel(step.verdict!)}
            </span>
          ) : (
            <span style={{ color: 'var(--pg-warn)' }}>
              <Spinner color="var(--pg-warn)" /> checking
            </span>
          )}
        </span>
      </div>
      {step.note ? (
        <div
          style={{
            fontSize: 13,
            color: 'var(--pg-dim)',
            marginTop: 3,
            opacity: interpolate(local, [G_NOTE, G_NOTE + 8], [0, 1]),
          }}
        >
          <span style={{ marginRight: 6 }}>↳</span>
          {step.note}
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Policy hook box — the meta-harness layer, wired to the terminal's side
// ---------------------------------------------------------------------------
const HookBox: React.FC<{ hookStep: number }> = ({ hookStep }) => {
  const frame = useFrame();
  const step = hookStep >= 0 ? STEPS[hookStep] : null;
  const local = hookStep >= 0 ? frame - START[hookStep] : -1;
  const matching = step && local >= G_HOOK && local < G_VERDICT;
  const resolved = step && local >= G_VERDICT;
  const color = step ? verdictColor(step.verdict!) : 'var(--pg-muted)';
  const rot = (frame * 4) % 360; // registry sync indicator, always turning

  return (
    <div
      style={{
        position: 'absolute',
        left: HOOK_X,
        top: HOOK_TOP,
        width: HOOK_W,
        height: HOOK_H,
        boxSizing: 'border-box',
        background: 'var(--pg-card)',
        border: `1px solid ${
          resolved
            ? color
            : 'color-mix(in srgb, var(--pg-warn) 16%, transparent)'
        }`,
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: CONSOLE_FONT,
        boxShadow: resolved
          ? `0 0 0 1px color-mix(in srgb, ${color} 13%, transparent), 0 0 24px -8px ${color}`
          : 'none',
      }}
    >
      {/* title + registry */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 10,
          borderBottom: `1px solid var(--pg-line)`,
        }}
      >
        <Mono size={14} color="var(--pg-text)" bold>
          <span style={{ color: 'var(--pg-warn)', marginRight: 7 }}>⬡</span>
          policy hook
        </Mono>
        <Mono size={11.5} color="var(--pg-dim)">
          acme-org
          <span
            style={{
              display: 'inline-block',
              marginLeft: 6,
              color: 'var(--pg-warn)',
              transform: `rotate(${rot}deg)`,
            }}
          >
            ↻
          </span>
        </Mono>
      </div>

      {/* evaluation body */}
      <div style={{ marginTop: 14, flex: 1, minHeight: 0 }}>
        {!step || local < G_HOOK ? (
          <Mono size={12.5} color="var(--pg-dim)">
            awaiting action…
          </Mono>
        ) : (
          <>
            <Mono size={11.5} color="var(--pg-muted)" style={{ marginBottom: 10 }}>
              eval&nbsp;
              <span style={{ color: 'var(--pg-text)' }}>
                {step.text.length > 24
                  ? step.text.slice(0, 23) + '…'
                  : step.text}
              </span>
            </Mono>
            <Mono size={13} color="var(--pg-text)" style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--pg-dim)' }}>rule&nbsp;</span>
              {step.rule}
            </Mono>
            {matching ? (
              <Mono size={13} color="var(--pg-warn)">
                <Spinner color="var(--pg-warn)" /> matching…
              </Mono>
            ) : resolved ? (
              <Mono size={13.5} color={color} bold>
                {verdictGlyph(step.verdict!)} {step.detail}
              </Mono>
            ) : null}
          </>
        )}
      </div>

      <Mono size={10.5} color="var(--pg-dim)">
        enforced in code · not prompts
      </Mono>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Connector — the wire from the active gated line's chip to the hook + a pulse
// ---------------------------------------------------------------------------
const Connector: React.FC<{ activeGated: number }> = ({ activeGated }) => {
  const frame = useFrame();
  if (activeGated < 0) return null;
  const step = STEPS[activeGated];
  const local = frame - START[activeGated];

  const wireOpacity = interpolate(local, [G_OUT - 4, G_OUT], [0, 1]);
  if (wireOpacity <= 0) return null;

  const ax = TERM_W - 14;
  const ay = ANCHOR_Y[activeGated];
  const bx = HOOK_X + 1;
  const by = HOOK_PORT_Y;

  const color = verdictColor(step.verdict!);
  const resolved = local >= G_VERDICT;
  const wireColor = resolved ? color : 'var(--pg-line)';

  // pulse: out (row→hook), dwell at hook, return (hook→row, verdict-colored)
  let pulse: { x: number; y: number; c: string } | null = null;
  if (local >= G_OUT && local < G_HOOK) {
    const t = (local - G_OUT) / (G_HOOK - G_OUT);
    pulse = { x: lerp(ax, bx, t), y: lerp(ay, by, t), c: 'var(--pg-warn)' };
  } else if (local >= G_HOOK && local < G_VERDICT) {
    pulse = { x: bx, y: by, c: 'var(--pg-warn)' };
  } else if (local >= G_VERDICT && local < G_STAMP) {
    const t = (local - G_VERDICT) / (G_STAMP - G_VERDICT);
    pulse = { x: lerp(bx, ax, t), y: lerp(by, ay, t), c: color };
  }

  const midx = (ax + bx) / 2;
  const path = `M ${ax} ${ay} C ${midx} ${ay} ${midx} ${by} ${bx} ${by}`;

  return (
    <svg
      width={STAGE_W}
      height={STAGE_H}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        strokeOpacity={wireOpacity * (resolved ? 0.9 : 0.5)}
        // stroke/fill via style so var() custom properties resolve (they are
        // ignored in SVG presentation attributes).
        style={{ stroke: wireColor }}
      />
      <circle
        cx={ax}
        cy={ay}
        r={2.5}
        opacity={wireOpacity}
        style={{ fill: wireColor }}
      />
      <rect
        x={bx - 3}
        y={by - 3}
        width={6}
        height={6}
        opacity={wireOpacity}
        style={{ fill: resolved ? color : 'var(--pg-warn)' }}
      />
      {pulse ? (
        <circle cx={pulse.x} cy={pulse.y} r={4} style={{ fill: pulse.c }} />
      ) : null}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const Scene: React.FC = () => {
  const frame = useFrame();

  const appear = interpolate(frame, [0, 14], [0, 1], { easing: easeOutCubic });
  const cycleFade = interpolate(frame, [FADE[0], FADE[1]], [1, 0]);
  const A = appear * cycleFade;
  const introScale = interpolate(frame, [0, 14], [0.985, 1], {
    easing: easeOutCubic,
  });

  // latest step that has started, and latest *gated* step that has started
  let active = -1;
  let hookStep = -1;
  for (let i = 0; i < N; i++) {
    if (frame >= START[i]) {
      active = i;
      if (STEPS[i].gated) hookStep = i;
    }
  }
  // the connector is live only while a gated step is the current action
  const activeGated = active >= 0 && STEPS[active].gated ? active : -1;

  return (
    <div
      style={{
        position: 'relative',
        width: STAGE_W,
        height: STAGE_H,
        opacity: A,
        transform: `scale(${introScale})`,
        transformOrigin: '50% 46%',
      }}
    >
      {/* underlying harness terminal */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: TERM_W,
          height: STAGE_H,
          boxSizing: 'border-box',
          background: 'var(--pg-surface)',
          border: `1px solid var(--pg-outline)`,
          boxShadow: 'var(--pg-shadow)',
          borderRadius: 16,
          padding: 22,
          overflow: 'hidden',
        }}
      >
        <Header />
        <div
          style={{
            marginTop: 14,
            height: 1,
            background: 'var(--pg-divider)',
          }}
        />
        <PromptRow />
        {STEPS.map((s, i) => (
          <Line key={i} step={s} index={i} />
        ))}
        {/* idle prompt pinned to the bottom */}
        <div
          style={{
            position: 'absolute',
            left: 26,
            bottom: 22,
            fontFamily: CONSOLE_FONT,
            fontSize: 14.5,
            color: 'var(--pg-text)',
          }}
        >
          <span style={{ color: 'var(--pg-muted)', marginRight: 8 }}>❯</span>
          <Cursor color="var(--pg-text)" blink />
        </div>
      </div>

      {/* meta-harness policy hook */}
      <HookBox hookStep={hookStep} />

      {/* wire + pulse between them */}
      <Connector activeGated={activeGated} />
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

export function PolicyGate({ className, style, seek }: PolicyGateProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [scale, setScale] = useState(1);
  const frame = useLoopFrame(inView, seek);
  const palette = usePalette();
  const mode = useThemeMode();
  // Project CSS custom properties; every inline style / SVG fill below reads them
  // via var(), so the scene re-themes reactively with the site toggle. The
  // terminal chrome (body, border, text, terracotta accent, shadow) pulls from the
  // shared console theme so it matches every other terminal; the policy diagram
  // (hook card, wire, verdict colors) stays on the semantic palette.
  const c = consoleTheme(mode);
  const vars = {
    '--pg-surface': c.bg, // terminal body
    '--pg-outline': c.border, // terminal border
    '--pg-shadow': c.shadow, // terminal drop shadow
    '--pg-divider': c.rule, // header hairline
    '--pg-text': c.text, // primary text/cursor
    '--pg-muted': c.muted, // muted labels
    '--pg-dim': c.dim, // faint/meta text
    '--pg-accent': c.accent, // Claude mark + spinner (terracotta)
    '--pg-card': palette.cardFill, // policy-hook card
    '--pg-line': palette.line, // hook rule + wire
    '--pg-ok': palette.statusOk, // allow verdict / success check
    '--pg-warn': palette.statusWarn, // checking/transform
    '--pg-error': palette.statusError, // deny verdict
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
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        ...vars,
        ...style,
      }}
      aria-label="A Claude Code session working on a task while a meta-harness policy hook checks each action against org rules: allowing, denying, and transforming them"
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
