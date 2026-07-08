import { type CSSProperties } from 'react';
import { useInView } from '../../lib/canvas';
import { usePalette, useThemeMode } from '../../lib/theme';
import claudeCodeLogo from './logos/claude-code.svg?url';
import codexLogo from './logos/codex.svg?url';
import opencodeLogo from './logos/opencode.svg?url';

export interface HarnessSwapDiagramProps {
  className?: string;
  style?: CSSProperties;
}

export function HarnessSwapDiagram({
  className,
  style,
}: HarnessSwapDiagramProps) {
  // The card swap is a pure CSS keyframe loop; SSR renders it, so without a gate
  // its clock runs from page load even off-screen. Hold it paused until in view.
  const { ref, inView } = useInView<HTMLDivElement>();
  const palette = usePalette();
  const mode = useThemeMode();
  // Project the shared palette as CSS custom properties; the <style> block below
  // reads them so the diagram re-themes reactively with the site toggle.
  const vars = {
    '--hs-accent': palette.accent,
    '--hs-surface': palette.surface,
    '--hs-outline': palette.outline,
    '--hs-line': palette.line,
    '--hs-text': palette.textHeader,
    '--hs-label': palette.textLabel,
    '--hs-dim': palette.textDim,
    // Codex mark ships black: invert to light only on the dark surface.
    '--hs-logo-invert': mode === 'dark' ? '1' : '0',
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className={`mh-harness-swap${className ? ` ${className}` : ''}`}
      style={{ ...vars, ...style }}
      data-run={inView ? 'true' : 'false'}
      aria-label="Meta-harness layer swapping harnesses"
    >
      <div className="mh-harness-swap__meta-shell">
        <div className="mh-harness-swap__header">
          <div className="mh-harness-swap__shell-label">Meta-harness</div>
          <div className="mh-harness-swap__shell-subtitle">
            Thin instrumentation layer
          </div>
        </div>

        <div className="mh-harness-swap__slot">
          <div className="mh-harness-swap__header">
            <div className="mh-harness-swap__slot-label">Harness</div>
            <div className="mh-harness-swap__slot-subtitle">
              swappable runtime
            </div>
          </div>

          <div className="mh-harness-swap__stage">
            <div className="mh-harness-swap__card mh-harness-swap__card--claude">
              <img src={claudeCodeLogo} alt="" aria-hidden="true" />
              <span>Claude Code</span>
            </div>

            <div className="mh-harness-swap__card mh-harness-swap__card--codex">
              <img src={codexLogo} alt="" aria-hidden="true" />
              <span>Codex</span>
            </div>

            <div className="mh-harness-swap__card mh-harness-swap__card--opencode">
              <img src={opencodeLogo} alt="OpenCode" />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mh-harness-swap {
          min-height: 20rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        }

        .mh-harness-swap__meta-shell {
          width: min(100%, 24rem);
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
          padding: 1.4rem;
          border: 1px solid var(--hs-outline);
          border-radius: 22px;
          background: color-mix(in srgb, var(--hs-surface) 32%, transparent);
        }

        .mh-harness-swap__header {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          line-height: 1.15;
        }

        .mh-harness-swap__shell-label,
        .mh-harness-swap__slot-label {
          font-size: 0.82rem;
          font-weight: 600;
        }

        .mh-harness-swap__shell-label {
          color: var(--hs-text);
        }

        .mh-harness-swap__slot-label {
          color: var(--hs-label);
        }

        .mh-harness-swap__shell-subtitle {
          font-size: 0.72rem;
          color: var(--hs-label);
        }

        .mh-harness-swap__slot-subtitle {
          font-size: 0.72rem;
          color: var(--hs-dim);
        }

        .mh-harness-swap__slot {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.1rem;
          border: 1px solid var(--hs-line);
          border-radius: 18px;
          background: color-mix(in srgb, var(--hs-surface) 54%, transparent);
        }

        .mh-harness-swap__stage {
          position: relative;
          height: 3.3rem;
        }

        .mh-harness-swap__card {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          border: 1px solid var(--hs-outline);
          border-radius: 10px;
          background: var(--hs-surface);
          color: var(--hs-text);
          opacity: 0;
          transform: translateY(0.4rem) scale(0.98);
          animation: mh-harness-swap 7.2s infinite;
          /* Held until the diagram scrolls into view (see data-run). */
          animation-play-state: paused;
        }

        .mh-harness-swap[data-run='true'] .mh-harness-swap__card {
          animation-play-state: running;
        }

        .mh-harness-swap__card img {
          width: 1.45rem;
          height: 1.45rem;
          flex: none;
        }

        .mh-harness-swap__card--codex img {
          /* Codex mark ships black; invert to light only on the dark surface. */
          filter: invert(var(--hs-logo-invert));
        }

        .mh-harness-swap__card span {
          font-size: 0.82rem;
          font-weight: 600;
        }

        .mh-harness-swap__card--claude {
          color: var(--hs-accent);
        }

        .mh-harness-swap__card--codex {
          animation-delay: 2.4s;
        }

        .mh-harness-swap__card--opencode {
          animation-delay: 4.8s;
        }

        .mh-harness-swap__card--opencode img {
          width: auto;
          height: 1.15rem;
          object-fit: contain;
        }

        @keyframes mh-harness-swap {
          0%,
          4% {
            opacity: 0;
            transform: translateY(0.4rem) scale(0.98);
          }
          11%,
          29% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          36%,
          100% {
            opacity: 0;
            transform: translateY(-0.4rem) scale(0.98);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mh-harness-swap__card {
            animation: none;
          }
          .mh-harness-swap__card--claude {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
