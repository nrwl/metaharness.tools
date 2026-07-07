import { type CSSProperties } from 'react';
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
  return (
    <div
      className={`mh-harness-swap${className ? ` ${className}` : ''}`}
      style={style}
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
          border: 1px solid #262626;
          border-radius: 22px;
          background: rgb(23 23 23 / 0.32);
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
          color: #e5e5e5;
        }

        .mh-harness-swap__slot-label {
          color: #a3a3a3;
        }

        .mh-harness-swap__shell-subtitle {
          font-size: 0.72rem;
          color: #a3a3a3;
        }

        .mh-harness-swap__slot-subtitle {
          font-size: 0.72rem;
          color: #737373;
        }

        .mh-harness-swap__slot {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.1rem;
          border: 1px solid #404040;
          border-radius: 18px;
          background: rgb(23 23 23 / 0.54);
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
          border: 1px solid #262626;
          border-radius: 10px;
          background: #171717;
          color: #e5e5e5;
          opacity: 0;
          transform: translateY(0.4rem) scale(0.98);
          animation: mh-harness-swap 7.2s infinite;
        }

        .mh-harness-swap__card img {
          width: 1.45rem;
          height: 1.45rem;
          flex: none;
        }

        .mh-harness-swap__card--codex img {
          /* Codex mark ships black; site is dark-only, so invert to light. */
          filter: invert(1);
        }

        .mh-harness-swap__card span {
          font-size: 0.82rem;
          font-weight: 600;
        }

        .mh-harness-swap__card--claude {
          color: rgb(212 180 131);
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
