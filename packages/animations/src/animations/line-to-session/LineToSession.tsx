import type { CSSProperties } from 'react';
import { useStageScale } from '../../lib/stage';
import { usePalette } from '../../lib/theme';
import type { VizPalette } from '../../lib/palette';
import { CONSOLE_FONT } from '../provisioning-setup/terminal';
import commitMono400 from '../provisioning-setup/fonts/commit-mono-400.woff2?url';
import commitMono700 from '../provisioning-setup/fonts/commit-mono-700.woff2?url';

/**
 * From a line of code to the session that wrote it: an open file with one line
 * picked out, its commit sha, and a line drawn from exactly that row to the
 * session card that produced it. Same running example the page uses in prose
 * (the payment retry), arrived at from the other direction.
 *
 * Static by design: it is a picture to read, not a sequence to watch. The only
 * client-side work is reading the theme and scaling the fixed stage.
 */
export interface LineToSessionProps {
  className?: string;
  style?: CSSProperties;
}

// Sized to the content. A 16:9 stage left a large empty band under the cards,
// which made the text column beside it read as badly aligned.
const STAGE_W = 960;
const STAGE_H = 288;

/** Top of the file card; every other y is measured off it. */
const TOP = 18;

const SHA = 'a4f19c2';

const CODE: { n: number; text: string; hit?: boolean }[] = [
  { n: 38, text: 'const client = axios.create({' },
  { n: 39, text: '  timeout: 4_000,' },
  { n: 40, text: '});' },
  { n: 41, text: '' },
  { n: 42, text: 'export const charge = withRetry(client.post, {' },
  { n: 43, text: '  retryOn: [408, 429, 503],', hit: true },
  { n: 44, text: '  maxAttempts: 3,' },
  { n: 45, text: '});' },
];

// Row geometry, so the connector can start at the highlighted line rather than
// at the middle of the card.
const CODE_TOP = TOP + 56; // stage y of the first code row
const ROW_H = 24;
const HIT_INDEX = CODE.findIndex((l) => l.hit);
const HIT_Y = CODE_TOP + HIT_INDEX * ROW_H + ROW_H / 2;

// The session card carries the answer, so it gets the larger share; the file
// only has to show enough lines to place the highlighted one in context.
const CODE_W = 468;
const GAP_W = 84;
const CARD_X = CODE_W + GAP_W;
const CARD_Y = TOP + 26;
const CARD_H = 232;

const Scene: React.FC<{ p: VizPalette }> = ({ p }) => (
  <div
    style={{
      width: STAGE_W,
      height: STAGE_H,
      position: 'relative',
      fontFamily: CONSOLE_FONT,
    }}
  >
    {/* ---- the file -------------------------------------------------------- */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: TOP,
        width: CODE_W,
        background: p.cardFill,
        border: `1px solid ${p.outline}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${p.divider}`,
          fontSize: 12,
          color: p.textLabel,
        }}
      >
        payments/client.ts
      </div>
      <div style={{ padding: '8px 0' }}>
        {CODE.map((l) => (
          <div
            key={l.n}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: ROW_H,
              padding: '0 16px',
              background: l.hit ? `rgba(${p.accentRgb}, 0.1)` : 'transparent',
              borderLeft: `2px solid ${l.hit ? p.accent : 'transparent'}`,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 30,
                flex: 'none',
                color: p.textFaint,
                fontSize: 11.5,
              }}
            >
              {l.n}
            </span>
            <span
              style={{
                color: l.hit ? p.textHeader : p.textLabel,
                whiteSpace: 'pre',
              }}
            >
              {l.text}
            </span>
            {l.hit && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: p.accent,
                  whiteSpace: 'nowrap',
                }}
              >
                {SHA}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>

    {/* ---- the connector, from that row to the card ------------------------ */}
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      width={STAGE_W}
      height={STAGE_H}
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={`M${CODE_W} ${HIT_Y} C ${CODE_W + 44} ${HIT_Y}, ${CARD_X - 44} ${CARD_Y + 34}, ${CARD_X - 6} ${CARD_Y + 34}`}
        stroke={p.accent}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx={CODE_W} cy={HIT_Y} r="3" fill={p.accent} />
    </svg>

    {/* ---- the session that wrote it --------------------------------------- */}
    <div
      style={{
        position: 'absolute',
        left: CARD_X,
        top: CARD_Y,
        width: STAGE_W - CARD_X,
        minHeight: CARD_H,
        background: p.cardFill,
        border: `1px solid ${p.accent}`,
        borderRadius: 12,
        boxSizing: 'border-box',
        padding: '14px 16px',
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
        fix-billing-timeouts
      </div>
      <div style={{ marginTop: 5, fontSize: 12, color: p.textDim }}>
        elena · 4 months ago
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
        contains {SHA}
      </div>
      <div
        style={{
          marginTop: 13,
          paddingTop: 12,
          borderTop: `1px solid ${p.divider}`,
          fontSize: 12.5,
          lineHeight: 1.55,
          color: p.textLabel,
        }}
      >
        “failing fast double-charged 41 orders, so we kept the retry — the
        idempotency key upstream is what makes it safe”
      </div>
    </div>
  </div>
);

export function LineToSession({ className, style }: LineToSessionProps) {
  const { ref, scale } = useStageScale<HTMLDivElement>(STAGE_W);
  const p = usePalette();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        ...style,
      }}
      aria-label="An open source file with one line highlighted and its commit sha, connected to the session card that produced that line and the reasoning recorded in it"
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
        <Scene p={p} />
      </div>
    </div>
  );
}
