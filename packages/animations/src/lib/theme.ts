/**
 * React glue for the shared {@link VizPalette}.
 *
 * The site toggles theme by adding/removing `.dark` on <html> (see the website's
 * no-flash init + toggle). These hooks track that class and hand components the
 * matching palette so both canvas kernels and DOM diagrams re-theme reactively
 * when the user flips the toggle. SSR-safe: renders dark until mounted, matching
 * the site's dark-by-default.
 */
import { useSyncExternalStore } from 'react';
import { getPalette, type ThemeMode, type VizPalette } from './palette';

function isDark(): boolean {
  if (typeof document === 'undefined') return true; // SSR / default dark
  return document.documentElement.classList.contains('dark');
}

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

/** Current theme mode, reactive to the `.dark` class on <html>. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    subscribe,
    () => (isDark() ? 'dark' : 'light'),
    () => 'dark', // server snapshot: dark-by-default
  );
}

/** The resolved palette for the current theme. */
export function usePalette(): VizPalette {
  return getPalette(useThemeMode());
}
