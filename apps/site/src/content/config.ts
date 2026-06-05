import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// ─────────────────────────────────────────────────────────────────────────────
// Programmatic-SEO content collections (Motore 2).
//
// Data format: YAML (`type: 'data'`). Each entry carries STRUCTURED data
// (competitor, differentiators, faq…) plus FIVE long markdown bodies — one per
// language — inside a single `i18n` object. A `.md` file can hold only one
// markdown body, so YAML (with block scalars `intro: |`) is the right fit; the
// `intro` is rendered to HTML at runtime via `marked`, exactly like LegalPage.
//
// i18n strategy for "language not yet translated":
//   - `en` is REQUIRED (it is the canonical, root-served language).
//   - it/fr/es/de are OPTIONAL at the type level.
//   - A page is "available" in a language only if that language key exists.
//     The route helper (`getAvailableLangs`, below) derives the available set
//     from the entry, so BaseLayout emits hreflang ONLY for translated langs,
//     and an untranslated lang either 404s or renders EN-fallback + noindex.
//     We default to NOT generating untranslated non-EN routes at all (cleanest
//     for SEO); the noindex+fallback path is available if we later want the URL
//     to exist. See src/pages/compare/[slug].astro for the wired behaviour.
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_LANGS = ['en', 'it', 'fr', 'es', 'de'] as const;

/** Per-language copy block. `intro` is long-form markdown (300+ words). */
const localizedCopy = z.object({
  title: z.string(),
  description: z.string(),
  intro: z.string(), // markdown, rendered with `marked` at the page level
  faq: z
    .array(
      z.object({
        q: z.string(),
        a: z.string(),
      })
    )
    .default([]),
});

/**
 * i18n container. `en` required (canonical); other langs optional so we can
 * ship a page before its translations exist. Missing key === not translated.
 */
const i18nCopy = z.object({
  en: localizedCopy,
  it: localizedCopy.optional(),
  fr: localizedCopy.optional(),
  es: localizedCopy.optional(),
  de: localizedCopy.optional(),
});

const compare = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/compare' }),
  schema: z.object({
    slug: z.string(),
    competitor: z.string(),
    category: z.string(),
    // Provenance: only set once a human has verified the comparison facts.
    verified: z.coerce.date().optional(),
    sources: z.array(z.string().url()).optional(),
    // Feature-by-feature rows. EVERYTHING optional — we only fill verified rows.
    differentiators: z
      .array(
        z.object({
          label: z.string(),
          sonabrief: z.string().optional(),
          competitor: z.string().optional(),
        })
      )
      .optional(),
    i18n: i18nCopy,
  }),
});

const forCollection = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/for' }),
  schema: z.object({
    slug: z.string(),
    profession: z.string(),
    painPoints: z.array(z.string()).default([]),
    i18n: i18nCopy,
  }),
});

export const collections = {
  compare,
  // Collection key is `for` in the content dir; exported under the same name.
  for: forCollection,
};

export { SUPPORTED_LANGS };
