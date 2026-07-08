/**
 * Shared theme palette for the animations (pure — no React, no DOM).
 *
 * Every animation, canvas or DOM, draws from this single semantic vocabulary so
 * the whole set flips together between the site's light and dark themes. Canvas
 * kernels receive the resolved {@link VizPalette} on their frame and read tokens
 * instead of hardcoding hex; DOM diagrams project the same tokens as CSS custom
 * properties. The dark values are the animations' original hand-tuned palette;
 * the light values are their counterparts for a white surface.
 *
 * Tokens are semantic, not literal — `surface` is "a filled panel/node body",
 * `textHeader` is "the most prominent label", etc. Not every animation uses
 * every token; the set is a superset so any kernel can pull what it needs.
 */

/** Resolved color set for one theme. */
export interface VizPalette {
  /** Accent (the brand gold): halos, selected edges, key marks. */
  accent: string;
  /** Accent as an "r, g, b" triplet for `rgba(${accentRgb}, a)` fills. */
  accentRgb: string;
  /** Lighter accent, for secondary accent fills/tints. */
  accentSoft: string;
  /** Accent mixed toward the foreground (context-node tint) as "r, g, b". */
  nodeTintRgb: string;

  /** Filled body of a node/panel/dot. */
  surface: string;
  /** Alternate/raised card fill. */
  cardFill: string;
  /** Hairline outline around a surface. */
  outline: string;
  /** Structural connector line / stronger border. */
  line: string;
  /** Faint divider (column rules, etc.). */
  divider: string;

  /** Most prominent text (headers, names). */
  textHeader: string;
  /** Text inside a filled node (reads on `surface`/tints). */
  nodeText: string;
  /** Secondary label text. */
  textLabel: string;
  /** Dim/tertiary text. */
  textDim: string;
  /** Faintest text (meta, counts). */
  textFaint: string;

  /** Neutral edge web between nodes, as "r, g, b". */
  edgeRgb: string;
  /** Starfield / speckle backdrop dots. */
  star: string;
  /** Status: done (blue). */
  statusDone: string;
  /** Status: stale (gray). */
  statusStale: string;
  /** Status: ok / success / verify (green). */
  statusOk: string;
  /** Status: ok as an "r, g, b" triplet for `rgba(${statusOkRgb}, a)` fills. */
  statusOkRgb: string;
  /** Status: warning / pending (amber). */
  statusWarn: string;
  /** Status: error / blocked (red). */
  statusError: string;

  /** Author/avatar tint fills (earthy 8-way set; nodeText reads on them). */
  tints: readonly string[];
}

/** Original hand-tuned dark palette (the site's default theme). */
export const DARK_PALETTE: VizPalette = {
  accent: '#d4b483',
  accentRgb: '212, 180, 131',
  accentSoft: '#e1cba8',
  nodeTintRgb: '225, 203, 168',

  surface: '#171717',
  cardFill: '#1c1c1c',
  outline: '#262626',
  line: '#404040',
  divider: '#2a2a2a',

  textHeader: '#e5e5e5',
  nodeText: '#f5f5f5',
  textLabel: '#a3a3a3',
  textDim: '#737373',
  textFaint: '#525252',

  edgeRgb: '163, 169, 150',
  star: '#ffffff',
  statusDone: '#3b82f6',
  statusStale: '#9ca3af',
  statusOk: '#6cc295',
  statusOkRgb: '108, 194, 149',
  statusWarn: '#fbbf24',
  statusError: '#cf6b6b',

  tints: [
    '#92400e',
    '#3f453d',
    '#404040',
    '#51584f',
    '#78350f',
    '#525252',
    '#5b4636',
    '#3a4a44',
  ],
};

/** Light-theme counterpart, tuned to read on a white/neutral-50 surface. */
export const LIGHT_PALETTE: VizPalette = {
  // Deepened gold so it stays legible against white instead of washing out.
  accent: '#a9711f',
  accentRgb: '169, 113, 31',
  accentSoft: '#c79a4e',
  nodeTintRgb: '169, 113, 31',

  surface: '#f4f4f5',
  cardFill: '#ffffff',
  outline: '#e4e4e7',
  line: '#d4d4d8',
  divider: '#e4e4e7',

  textHeader: '#18181b',
  nodeText: '#18181b',
  textLabel: '#52525b',
  textDim: '#71717a',
  textFaint: '#a1a1aa',

  edgeRgb: '113, 113, 122',
  star: '#a1a1aa',
  statusDone: '#2563eb',
  statusStale: '#9ca3af',
  // Status hues deepened one step so they read on white.
  statusOk: '#16a34a',
  statusOkRgb: '22, 163, 74',
  statusWarn: '#d97706',
  statusError: '#dc2626',

  // Pastel earthy tints so dark nodeText reads on the avatar fills.
  tints: [
    '#f5d6a8',
    '#dbe2cf',
    '#e4e4e7',
    '#dae1d0',
    '#f3d3a3',
    '#e4e4e7',
    '#e8d8c2',
    '#d3e0d6',
  ],
};

/** Theme mode. */
export type ThemeMode = 'light' | 'dark';

/** Resolve the palette for a theme mode (defaults to dark). */
export function getPalette(mode: ThemeMode): VizPalette {
  return mode === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}
