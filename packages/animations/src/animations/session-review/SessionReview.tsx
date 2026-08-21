import type { CSSProperties, ReactNode } from 'react';
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
 * Interactive review sessions: one console split in two. On the right, a
 * reviewing agent hits a decision it cannot justify from the diff and asks the
 * session that made it. On the left, the implementer's session is resumed and
 * answers, with the approaches it rejected attached.
 *
 * Each side keeps its own chrome — Claude Code's mascot header and Codex's
 * boxed banner over a highlighted prompt band — so the two agents read as two
 * different tools rather than one styled twice.
 *
 * Static by design: it is a picture to read, not a sequence to watch.
 */
export interface SessionReviewProps {
  className?: string;
  style?: CSSProperties;
}

// A narrower stage means less downscaling on the page, so the type inside
// reads at close to its logical size.
const STAGE_W = 840;
const STAGE_H = 352;
const RIGHT_W = 358;

const ROW: CSSProperties = {
  display: 'flex',
  gap: 8,
  fontFamily: CONSOLE_FONT,
  fontSize: 14,
  lineHeight: 1.55,
};

// ---------------------------------------------------------------------------
// Transcript lines
// ---------------------------------------------------------------------------
const Say: React.FC<{ bullet: string; children: ReactNode }> = ({
  bullet,
  children,
}) => (
  <div style={{ ...ROW, color: CLAUDE.text }}>
    <span style={{ color: bullet, flex: 'none' }}>&#9679;</span>
    <span>{children}</span>
  </div>
);

const Result: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ ...ROW, paddingLeft: 22, color: CLAUDE.dim, marginTop: 1 }}>
    <span style={{ flex: 'none' }}>&#9500;</span>
    <span>{children}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Left pane — Claude Code, the implementer's session, resumed
// ---------------------------------------------------------------------------
const ClaudeMark: React.FC = () => (
  <svg width="27" height="27" viewBox="0 0 24 24" style={{ display: 'block' }}>
    <path
      d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949z"
      style={{ fill: CLAUDE.accent }}
    />
    <rect x="6" y="8.102" width="1.488" height="2.847" fill="#171310" />
    <rect x="16.51" y="8.102" width="1.49" height="2.847" fill="#171310" />
  </svg>
);

const ClaudePane: React.FC = () => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div
      style={{
        padding: '18px 20px 0',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flex: 'none' }}>
        <ClaudeMark />
      </span>
      <div style={{ lineHeight: 1.4, fontFamily: CONSOLE_FONT, fontSize: 14 }}>
        <div style={{ color: CLAUDE.text }}>
          <span style={{ fontWeight: 700 }}>Claude Code</span>{' '}
          <span style={{ color: CLAUDE.muted }}>v2.1</span>
        </div>
        <div style={{ color: CLAUDE.muted }}>
          session &middot; migrate-search-cache
        </div>
      </div>
    </div>

    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 13,
      }}
    >
      <div>
        <div style={{ ...ROW, color: CLAUDE.text }}>
          <span style={{ color: CLAUDE.muted, flex: 'none' }}>&gt;</span>
          <span>why a TTL cache and not LRU?</span>
        </div>
        <div
          style={{
            ...ROW,
            paddingLeft: 22,
            fontSize: 12,
            color: CLAUDE.dim,
            marginTop: 2,
          }}
        >
          asked by the review session
        </div>
      </div>

      <Say bullet={CLAUDE.accent}>
        LRU was tried first and OOM&rsquo;d at 40k keys in staging. Dropping the
        cache took p95 from 40ms to 900ms. TTL at 60s was the only one where
        stale results were acceptable.
      </Say>
    </div>

    <div
      style={{
        borderTop: `1px solid ${CLAUDE.rule}`,
        padding: '11px 20px',
        fontFamily: CONSOLE_FONT,
        fontSize: 12.5,
        color: CLAUDE.dim,
      }}
    >
      resumed &middot; leo &middot; 2 days ago &middot; 41 messages
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Right pane — Codex, the reviewer. Boxed banner, then a highlighted prompt
// band with the model/cwd status line underneath, the way the CLI prints it.
// ---------------------------------------------------------------------------
const KV: React.FC<{ k: string; v: ReactNode }> = ({ k, v }) => (
  <div style={{ display: 'flex', fontSize: 12.5, lineHeight: 1.6 }}>
    <span style={{ color: CLAUDE.muted, width: 82, flex: 'none' }}>{k}</span>
    <span style={{ color: CLAUDE.text, minWidth: 0 }}>{v}</span>
  </div>
);

const CodexPane: React.FC = () => (
  <div
    style={{
      width: RIGHT_W,
      flex: 'none',
      display: 'flex',
      flexDirection: 'column',
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

    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: '14px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
      }}
    >
      <Say bullet={CLAUDE.muted}>
        The cache swap is not justified by the diff.
      </Say>
      <div>
        <Say bullet={CLAUDE.muted}>ask_session(migrate-search-cache)</Say>
        <Result>answered &middot; 2 rejected approaches</Result>
      </div>
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
        }}
      >
        <span style={{ color: CLAUDE.muted, marginRight: '0.6em' }}>
          &rsaquo;
        </span>
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

const Scene: React.FC = () => (
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
      overflow: 'hidden',
    }}
  >
    <ClaudePane />
    <div
      style={{
        width: 1,
        flex: 'none',
        background: CLAUDE.rule,
        alignSelf: 'stretch',
      }}
    />
    <CodexPane />
  </div>
);

export function SessionReview({ className, style }: SessionReviewProps) {
  const { ref, scale } = useStageScale<HTMLDivElement>(STAGE_W);
  const mode = useThemeMode();
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
      aria-label="A split console: on the right Codex reviewing a pull request asks the session behind a change why it chose a TTL cache, on the left the implementer's Claude Code session is resumed and answers with the approaches it rejected"
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
          zoom: scale ?? 1,
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        <Scene />
      </div>
    </div>
  );
}
