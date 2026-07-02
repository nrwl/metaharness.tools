// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://metaharness.tools',
  outDir: '../../dist/apps/website',
  vite: {
    plugins: [tailwindcss()],
  },
});
