// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import seoArtifacts from './integrations/seo-artifacts.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://metaharness.tools',
  integrations: [react(), sitemap(), seoArtifacts()],
  vite: {
    plugins: [tailwindcss()],
  },
});
