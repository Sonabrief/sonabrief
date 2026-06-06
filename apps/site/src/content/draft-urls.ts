// Build-time helper: list the URL paths of pSEO entries marked `draft: true`,
// across every language they're translated into. Used by astro.config.ts so the
// sitemap filter excludes draft pages — keeping noindex and the sitemap in sync.
//
// Why line-based parsing instead of a YAML lib: astro.config runs before the
// content layer is available (getCollection can't be used here), and the repo
// has no standalone YAML dependency. The pSEO YAML files have a regular shape
// (2-space indent, fixed top-level keys), so a tiny scanner is reliable and
// keeps the config dependency-free. If a real YAML parser is ever added, this
// can be swapped for a structured parse without touching the config.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPPORTED_LANGS = ['en', 'it', 'fr', 'es', 'de'] as const;

/** Section dir name → URL prefix segment. Same string here, kept explicit. */
const COLLECTIONS = ['compare', 'for'] as const;

interface ScannedEntry {
  slug: string;
  draft: boolean;
  langs: string[]; // languages with a top-level i18n key
}

function scanFile(yaml: string): { slug: string; draft: boolean; langs: string[] } {
  const lines = yaml.split('\n');
  let slug = '';
  let draft = false;
  const langs: string[] = [];
  let inI18n = false;

  for (const line of lines) {
    // Top-level keys are unindented (column 0).
    const topMatch = /^([a-zA-Z0-9_]+):/.exec(line);
    if (topMatch) {
      const key = topMatch[1];
      inI18n = key === 'i18n';
      if (key === 'slug') slug = line.slice(line.indexOf(':') + 1).trim().replace(/['"]/g, '');
      if (key === 'draft') {
        draft = /:\s*true\b/.test(line);
      }
      continue;
    }
    // Inside i18n: a language key is indented exactly 2 spaces.
    if (inI18n) {
      const langMatch = /^ {2}([a-z]{2}):\s*$/.exec(line);
      if (langMatch && (SUPPORTED_LANGS as readonly string[]).includes(langMatch[1])) {
        langs.push(langMatch[1]);
      }
    }
  }
  return { slug, draft, langs };
}

/**
 * Absolute URL paths (origin-relative, trailing slash) for all draft pSEO
 * pages, in every translated language. EN lives at the root; others are
 * prefixed. e.g. draft `for/lawyers` (en, it) → ['/for/lawyers/', '/it/for/lawyers/'].
 */
export function getDraftUrlPaths(contentBase = './src/content'): Set<string> {
  const out = new Set<string>();

  for (const collection of COLLECTIONS) {
    const dir = join(contentBase, collection);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.yaml')) continue;
      const entry: ScannedEntry = scanFile(readFileSync(join(dir, file), 'utf-8'));
      if (!entry.draft || !entry.slug) continue;
      for (const lang of entry.langs) {
        const path =
          lang === 'en'
            ? `/${collection}/${entry.slug}/`
            : `/${lang}/${collection}/${entry.slug}/`;
        out.add(path);
      }
    }
  }
  return out;
}
