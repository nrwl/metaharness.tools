/**
 * Terminal primitives for the ProvisioningSetup animation, ported from the
 * Remotion sources (video-animations `@packages/motion` console + Polygraph
 * clips) to run standalone in the DOM.
 *
 * The port swaps Remotion's `useCurrentFrame` for a plain {@link FrameContext}
 * (the wrapper drives it from an rAF elapsed clock at a fixed virtual {@link FPS}),
 * so the original frame-based timeline constants transfer verbatim. Everything
 * here is pure/stateless w.r.t. that frame value, so a given frame always renders
 * identically (and can be frozen for stories via the wrapper's `seek` prop).
 */
import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { clamp01, easeInOut } from '../../lib/anim';

/** Virtual frame rate the ported timeline is authored against. */
export const FPS = 30;

/** font-family value used everywhere in the terminal. */
export const CONSOLE_FONT =
  "'Commit Mono', 'SF Mono', 'JetBrains Mono', ui-monospace, monospace";

// ---------------------------------------------------------------------------
// Frame plumbing (stand-in for Remotion's useCurrentFrame)
// ---------------------------------------------------------------------------
const FrameContext = createContext(0);
export const FrameProvider = FrameContext.Provider;
export const useFrame = () => useContext(FrameContext);

// ---------------------------------------------------------------------------
// interpolate — a faithful subset of Remotion's, clamped by default, with an
// optional easing applied per-segment.
// ---------------------------------------------------------------------------
export interface InterpolateOptions {
  /** Clamp to the output range ends (default true). */
  clamp?: boolean;
  /** Eases the 0..1 position within the active segment. */
  easing?: (t: number) => number;
}
export function interpolate(
  frame: number,
  input: readonly number[],
  output: readonly number[],
  { clamp = true, easing }: InterpolateOptions = {},
): number {
  const n = input.length;
  if (frame <= input[0]) return clamp ? output[0] : extend(frame, input, output, 0);
  if (frame >= input[n - 1])
    return clamp ? output[n - 1] : extend(frame, input, output, n - 2);
  let i = 0;
  while (i < n - 1 && frame > input[i + 1]) i++;
  const t0 = input[i];
  const t1 = input[i + 1];
  let t = t1 === t0 ? 0 : (frame - t0) / (t1 - t0);
  if (easing) t = easing(t);
  return output[i] + (output[i + 1] - output[i]) * t;
}
function extend(
  frame: number,
  input: readonly number[],
  output: readonly number[],
  i: number,
): number {
  const t = (frame - input[i]) / (input[i + 1] - input[i]);
  return output[i] + (output[i + 1] - output[i]) * t;
}

/** Cubic ease-out (Remotion's Easing.out(Easing.cubic)). */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Cubic ease-in/out — re-exported for call-site parity with the source. */
export const easeInOutCubic = easeInOut;

// ---------------------------------------------------------------------------
// Cursor — solid block glyph that inherits the font cell; blinks when idle.
// ---------------------------------------------------------------------------
export interface CursorProps {
  color: string;
  /** Blink when idle (pass true); stays solid while typing. */
  blink?: boolean;
  period?: number;
}
export const Cursor: React.FC<CursorProps> = ({ color, blink = false, period = 16 }) => {
  const frame = useFrame();
  const opacity = blink ? (Math.floor(frame / period) % 2 === 0 ? 1 : 0.12) : 1;
  return <span style={{ color, opacity }}>█</span>;
};

// ---------------------------------------------------------------------------
// Typewriter — deterministic, humanized cadence (ported from useTypewriter).
// ---------------------------------------------------------------------------
const hash = (i: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
function buildCharFrames(
  text: string,
  startFrame: number,
  framesPerChar: number,
  humanize: number,
  seed: number,
): number[] {
  const n = text.length;
  if (n === 0) return [];
  if (n === 1) return [Math.round(startFrame)];
  const factors: number[] = [];
  for (let i = 1; i < n; i++) {
    let f = 0.6 + hash(i, seed);
    if (hash(i + 1000, seed) > 0.9) f += 0.8;
    if (text[i - 1] === ' ') f += 0.5;
    factors.push(f);
  }
  const mean = factors.reduce((a, b) => a + b, 0) / factors.length || 1;
  const frames = [Math.round(startFrame)];
  let acc = startFrame;
  for (let i = 1; i < n; i++) {
    const norm = factors[i - 1] / mean;
    acc += framesPerChar * (1 + (norm - 1) * humanize);
    frames.push(Math.round(acc));
  }
  return frames;
}
export interface TypewriterState {
  shown: string;
  typedChars: number;
  done: boolean;
  endFrame: number;
}
export function useTyped(
  text: string,
  { startFrame = 0, cps = 20, humanize = 0.6, seed = 1 } = {},
): TypewriterState {
  const frame = useFrame();
  const charFrames = buildCharFrames(text, startFrame, FPS / cps, humanize, seed);
  let typedChars = 0;
  for (const cf of charFrames) {
    if (cf <= frame) typedChars++;
    else break;
  }
  return {
    shown: text.slice(0, typedChars),
    typedChars,
    done: typedChars >= text.length,
    endFrame: charFrames[charFrames.length - 1] ?? startFrame,
  };
}

// ---------------------------------------------------------------------------
// Mono — a monospace text line.
// ---------------------------------------------------------------------------
export const Mono: React.FC<{
  children: ReactNode;
  color?: string;
  bold?: boolean;
  size?: number;
  style?: CSSProperties;
}> = ({ children, color, bold, size, style }) => (
  <div
    style={{
      fontFamily: CONSOLE_FONT,
      color,
      fontWeight: bold ? 700 : 400,
      fontSize: size,
      lineHeight: 1.42,
      whiteSpace: 'pre',
      ...style,
    }}
  >
    {children}
  </div>
);

export { clamp01 };

// ---------------------------------------------------------------------------
// Console theme — the canonical Claude Code console tokens (lightConsole /
// darkConsole from the Remotion `@packages/motion` source), the single source
// of truth for every terminal card across the site so they can't drift apart.
// Consumers spread `consoleVars(mode)` onto their root (projecting the `--pv-cc-*`
// custom properties the CLAUDE token object reads) and style their card from
// CLAUDE.bg / .border / .shadow so all terminals share one warm-neutral look.
// ---------------------------------------------------------------------------
export interface ConsoleTheme {
  /** card background */
  bg: string;
  /** card border (very subtle) */
  border: string;
  /** soft drop shadow under the card (web-tuned, subtler than the video's) */
  shadow: string;
  /** primary text */
  text: string;
  /** secondary text (version, subtitle, cwd) */
  muted: string;
  /** faint detail text (tool result tails) */
  dim: string;
  /** background of a highlighted user-prompt row */
  promptHighlight: string;
  /** block cursor color */
  cursor: string;
  /** brand / status accent (terracotta) */
  accent: string;
  /** success bullet (completed tool call) */
  success: string;
  /** hairline rules (around the input row) */
  rule: string;
}

export const LIGHT_CONSOLE: ConsoleTheme = {
  bg: '#faf9f5',
  border: 'rgba(20, 18, 14, 0.08)',
  shadow: '0 8px 24px rgba(40, 34, 24, 0.10), 0 1px 3px rgba(40, 34, 24, 0.08)',
  text: '#1f1d1a',
  muted: '#8a857c',
  dim: '#b3aea4',
  promptHighlight: 'rgba(20, 18, 14, 0.05)',
  cursor: '#1f1d1a',
  accent: '#c15f3c',
  success: '#3f9d6d',
  rule: 'rgba(20, 18, 14, 0.10)',
};

export const DARK_CONSOLE: ConsoleTheme = {
  bg: '#191713',
  border: 'rgba(255, 250, 240, 0.10)',
  shadow: '0 12px 32px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.40)',
  text: '#ece8e1',
  muted: '#9a958c',
  dim: '#6b675f',
  promptHighlight: 'rgba(255, 250, 240, 0.06)',
  cursor: '#ece8e1',
  accent: '#e08a63',
  success: '#6cc295',
  rule: 'rgba(255, 250, 240, 0.10)',
};

export const consoleTheme = (mode: 'light' | 'dark'): ConsoleTheme =>
  mode === 'dark' ? DARK_CONSOLE : LIGHT_CONSOLE;

/** The console theme projected as the `--pv-cc-*` custom properties CLAUDE reads. */
export function consoleVars(mode: 'light' | 'dark'): CSSProperties {
  const t = consoleTheme(mode);
  return {
    '--pv-cc-bg': t.bg,
    '--pv-cc-border': t.border,
    '--pv-cc-shadow': t.shadow,
    '--pv-cc-text': t.text,
    '--pv-cc-muted': t.muted,
    '--pv-cc-dim': t.dim,
    '--pv-cc-highlight': t.promptHighlight,
    '--pv-cc-accent': t.accent,
    '--pv-cc-success': t.success,
    '--pv-cc-rule': t.rule,
  } as CSSProperties;
}

// ---------------------------------------------------------------------------
// Palettes — the source terminals' tokens, projected as CSS custom properties so
// the diagram re-themes with the site toggle. The CLAUDE console tokens read the
// `--pv-cc-*` vars from consoleVars(); the POLY provisioning tokens read `--pv-pg-*`
// (resolved by ProvisioningSetup from the shared VizPalette).
// ---------------------------------------------------------------------------
/** Claude Code console tokens — read the shared console theme (consoleVars). */
export const CLAUDE = {
  bg: 'var(--pv-cc-bg)',
  border: 'var(--pv-cc-border)',
  shadow: 'var(--pv-cc-shadow)',
  text: 'var(--pv-cc-text)',
  muted: 'var(--pv-cc-muted)',
  dim: 'var(--pv-cc-dim)',
  promptHighlight: 'var(--pv-cc-highlight)',
  cursor: 'var(--pv-cc-text)',
  accent: 'var(--pv-cc-accent)',
  success: 'var(--pv-cc-success)',
  rule: 'var(--pv-cc-rule)',
} as const;

/** Polygraph provisioning terminal tokens (amber / limed-ash). */
export const POLY = {
  amber: 'var(--pv-pg-amber)',
  amberRgb: '245, 158, 11', // unused in this port
  text: 'var(--pv-pg-text)',
  muted: 'var(--pv-pg-muted)',
  faint: 'var(--pv-pg-faint)',
  cardBg: 'var(--pv-pg-cardbg)',
  shellBg: '#050604', // unused in this port
  border: 'var(--pv-pg-border)',
  rule: 'var(--pv-pg-rule)',
  green: 'var(--pv-pg-green)',
  blue: '#6aa3ff', // unused in this port
  magenta: '#e0709a', // unused in this port
} as const;
