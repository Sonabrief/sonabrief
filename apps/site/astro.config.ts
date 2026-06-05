import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://sonabrief.com',
  output: 'static',
  // EN is canonical on the root. /en 301-redirects to / so we don't split
  // ranking signals across two identical English homepages. (Astro treats
  // /en and /en/ as the same static route; the edge `public/_redirects`
  // covers both with a real 301 header.)
  redirects: {
    '/en': { status: 301, destination: '/' },
  },
  integrations: [
    sitemap({
      // 404 pages must never be indexed; keep them out of the sitemap.
      filter: (page) => !/\/404\/?$/.test(page),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
