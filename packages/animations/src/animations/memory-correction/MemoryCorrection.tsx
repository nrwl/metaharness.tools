import type { CSSProperties } from 'react';
import { useStageScale } from '../../lib/stage';
import { useThemeMode } from '../../lib/theme';
import {
  CLAUDE,
  CONSOLE_FONT,
  consoleVars,
} from '../provisioning-setup/terminal';
import commitMono400 from '../provisioning-setup/fonts/commit-mono-400.woff2?url';
import commitMono700 from '../provisioning-setup/fonts/commit-mono-700.woff2?url';

/**
 * Memory correction: a finished Claude Code transcript in which the agent reads
 * unfamiliar code, calls a deliberate tradeoff a P0 with total confidence, then
 * finds the session that produced it and reverses itself. The point is the
 * reversal — the model did not get smarter between the two verdicts, it got the
 * context it was missing.
 *
 * Deliberately static: no clock, no reveal, no typewriter. It is a console you
 * read, laid out the way the real one is (header, transcript, then the prompt
 * row pinned to the bottom behind a hairline). The only client-side work is
 * reading the theme so the card flips with the site toggle, and measuring the
 * container so the fixed stage scales to it.
 */
export interface MemoryCorrectionProps {
  className?: string;
  style?: CSSProperties;
}

// Design stage (4:3); everything is laid out in these logical px and uniformly
// scaled to the container width. Sized so the transcript nearly fills the card
// rather than floating above a large gap.
const STAGE_W = 720;
const STAGE_H = 480;

const PROMPT = 'why does the payment client retry every failed charge?';

// ---------------------------------------------------------------------------
// Header — pixel mascot + meta lines
// ---------------------------------------------------------------------------
const Mascot: React.FC<{ cell?: number }> = ({ cell = 5.5 }) => (
  <svg
    width={cell * 6}
    height={cell * 6}
    viewBox="0 0 24 24"
    style={{ display: 'block', flex: 'none' }}
  >
    {/* Official Claude Code mark; body fill via style so an accent var() resolves. */}
    <path
      d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949z"
      style={{ fill: CLAUDE.accent }}
    />
    {/* Solid near-black eyes: the official mark cuts these out, but a light
        console bg would swallow the cut-outs, so draw them explicitly. */}
    <rect x="6" y="8.102" width="1.488" height="2.847" fill="#171310" />
    <rect x="16.51" y="8.102" width="1.49" height="2.847" fill="#171310" />
  </svg>
);

const Header: React.FC = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
    <Mascot />
    <div style={{ lineHeight: 1.4, fontFamily: CONSOLE_FONT, fontSize: 14.5 }}>
      <div style={{ color: CLAUDE.text }}>
        <span style={{ fontWeight: 700 }}>Claude Code</span>{' '}
        <span style={{ color: CLAUDE.muted }}>v2.1</span>
      </div>
      <div style={{ color: CLAUDE.muted }}>Fable 5 · payments service</div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Transcript primitives, shaped the way Claude Code actually prints:
//   > the submitted prompt
//   ⏺ Tool(args)
//     ⎿  result
//   ⏺ assistant prose, hanging-indented under the bullet
// ---------------------------------------------------------------------------
const ROW: CSSProperties = {
  display: 'flex',
  gap: 9,
  fontFamily: CONSOLE_FONT,
  fontSize: 15,
  lineHeight: 1.55,
};

const UserLine: React.FC<{ children: string }> = ({ children }) => (
  <div style={{ ...ROW, color: CLAUDE.text }}>
    <span style={{ color: CLAUDE.muted, flex: 'none' }}>&gt;</span>
    <span>{children}</span>
  </div>
);

const ToolCall: React.FC<{ name: string; args: string }> = ({ name, args }) => (
  <div style={ROW}>
    <span style={{ color: CLAUDE.accent, flex: 'none' }}>⏺</span>
    <span style={{ color: CLAUDE.text }}>
      {name}
      <span style={{ color: CLAUDE.muted }}>({args})</span>
    </span>
  </div>
);

const ToolResult: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...ROW, paddingLeft: 24, color: CLAUDE.dim, marginTop: 1 }}>
    <span style={{ flex: 'none' }}>⎿</span>
    <span>{children}</span>
  </div>
);

const Say: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ ...ROW, color: CLAUDE.text }}>
    <span style={{ color: CLAUDE.accent, flex: 'none' }}>⏺</span>
    <span>{children}</span>
  </div>
);

// ---------------------------------------------------------------------------
// The console card: header, transcript, prompt row pinned to the bottom.
// ---------------------------------------------------------------------------
const Console: React.FC = () => (
  <div
    style={{
      width: STAGE_W,
      height: STAGE_H,
      boxSizing: 'border-box',
      background: CLAUDE.bg,
      border: `1px solid ${CLAUDE.border}`,
      boxShadow: CLAUDE.shadow,
      borderRadius: 14,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}
  >
    <div style={{ padding: '20px 22px 0' }}>
      <Header />
    </div>

    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: '16px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 13,
      }}
    >
      <UserLine>{PROMPT}</UserLine>

      <div>
        <ToolCall name="Read" args="payments/client.ts" />
        <ToolResult>Read 240 lines</ToolResult>
      </div>

      <Say>
        This is a <span style={{ color: CLAUDE.accent }}>P0</span>. withRetry
        wraps every call to POST /charges, so a single timeout can bill the
        customer twice. I would drop the retry and fail fast.
      </Say>

      <div>
        <ToolCall
          name="polygraph - search_sessions"
          args='query: "payments retry"'
        />
        <ToolResult>
          Found 1 session
          <br />
          fix-billing-timeouts · elena · 4 months ago
        </ToolResult>
      </div>

      <Say>
        Correcting myself, the retry is deliberate. Failing fast was tried first
        and double-charged 41 orders before the rollback. Checkout sets an
        idempotency key upstream, which is what makes the retry safe. Leaving it
        in place.
      </Say>
    </div>

    {/* Prompt row, where the real console keeps it: bottom, behind a hairline. */}
    <div
      style={{
        borderTop: `1px solid ${CLAUDE.rule}`,
        padding: '12px 22px',
        display: 'flex',
        alignItems: 'baseline',
        fontFamily: CONSOLE_FONT,
        fontSize: 15,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: CLAUDE.muted, marginRight: '0.6em' }}>&gt;</span>
      <span
        style={{
          display: 'inline-block',
          width: '0.6em',
          height: '1.05em',
          background: CLAUDE.cursor,
          opacity: 0.85,
          transform: 'translateY(0.14em)',
        }}
      />
    </div>
  </div>
);

export function MemoryCorrection({ className, style }: MemoryCorrectionProps) {
  const { ref, scale } = useStageScale<HTMLDivElement>(STAGE_W);
  const mode = useThemeMode();

  // The card chrome reads the shared console theme, so every terminal across
  // the site flips identically with the site toggle.
  const vars = consoleVars(mode);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...vars,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        ...style,
      }}
      aria-label="A Claude Code transcript: the agent flags a retry wrapper as a critical bug, then finds the earlier session that introduced it and reverses the verdict"
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
          // `zoom` scales layout as well as paint, so this box occupies exactly
          // the space it appears to; hidden until measured so a full-width
          // stage never flashes before it is scaled down.
          zoom: scale ?? 1,
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        <Console />
      </div>
    </div>
  );
}
