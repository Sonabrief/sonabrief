import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { getDraftUrlPaths } from './src/content/draft-urls';

// pSEO pages marked `draft: true` are noindex'd; keep them out of the sitemap
// too so both signals agree. Computed once at config load.
const draftPaths = getDraftUrlPaths();

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
      // Draft pSEO pages are noindex'd — exclude them so both signals agree.
      filter: (page) => {
        if (/\/404\/?$/.test(page)) return false;
        const { pathname } = new URL(page);
        return !draftPaths.has(pathname);
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
