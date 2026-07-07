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
// Palettes — kept identical to the two source terminals.
// ---------------------------------------------------------------------------
/** ConsoleDemoDark (Claude Code console) tokens. */
export const CLAUDE = {
  bg: '#191713',
  border: 'rgba(255, 250, 240, 0.10)',
  text: '#ece8e1',
  muted: '#9a958c',
  dim: '#6b675f',
  promptHighlight: 'rgba(255, 250, 240, 0.06)',
  cursor: '#ece8e1',
  accent: '#e08a63',
  success: '#6cc295',
  rule: 'rgba(255, 250, 240, 0.10)',
} as const;

/** Polygraph provisioning terminal tokens (amber / limed-ash). */
export const POLY = {
  amber: '#FBBF24',
  amberRgb: '245, 158, 11',
  text: '#FFFBEB',
  muted: '#A3A99F',
  faint: '#737B6E',
  cardBg: '#0A0C09',
  shellBg: '#050604',
  border: 'rgba(245, 158, 11, 0.16)',
  rule: '#3F453D',
  green: '#5bd6a0',
  blue: '#6aa3ff',
  magenta: '#e0709a',
} as const;
