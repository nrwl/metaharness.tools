// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import seoArtifacts from './integrations/seo-artifacts.mjs';

// On Netlify preview/branch deploys the canonical domain isn't live yet, so
// resolve social/canonical URLs (incl. og:image) against the deploy URL there —
// otherwise og:image points at the not-yet-published production domain and 404s.
// Production and local dev keep the canonical domain.
const site =
  process.env.CONTEXT && process.env.CONTEXT !== 'production' && process.env.DEPLOY_PRIME_URL
    ? process.env.DEPLOY_PRIME_URL
    : 'https://metaharness.tools';

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [
    react(),
    sitemap({
      serialize: (item) => ({
        ...item,
        lastmod: new Date().toISOString(),
      }),
    }),
    seoArtifacts(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
