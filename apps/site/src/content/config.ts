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

/**
 * Localized text for ONE comparison row, keyed by the neutral differentiator
 * key at the entry's top level (e.g. `pricing`). Both sides optional so a row
 * can carry only the half we've verified.
 */
const differentiatorCell = z.object({
  sonabrief: z.string().optional(),
  competitor: z.string().optional(),
});

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
  // Compare-only: localized cell text per differentiator key. Optional so a
  // language can be translated for prose but not (yet) for the table, and so
  // `for` entries simply omit it. Keys must match the top-level neutral order.
  differentiators: z.record(z.string(), differentiatorCell).optional(),
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

/**
 * Optional secondary CTA on a pSEO page. `href` is an absolute path WITHOUT the
 * language prefix (e.g. "security"); the renderer prepends the current lang.
 * `labelKey` selects which pre-translated label to show from t.pseo.cta.*. When
 * the whole field is absent the renderer defaults to the /security CTA.
 */
const secondaryCta = z
  .object({
    href: z.string(),
    labelKey: z.string().optional(),
  })
  .optional();

const compare = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/compare' }),
  schema: z.object({
    slug: z.string(),
    competitor: z.string(),
    category: z.string(),
    // Provenance: only set once a human has verified the comparison facts.
    verified: z.coerce.date().optional(),
    sources: z.array(z.string().url()).optional(),
    // Explicit draft flag: when true the page shows the draft banner and is
    // noindex'd. Independent of title text — robust for the copy pipeline.
    draft: z.boolean().default(false),
    secondaryCta,
    // Neutral differentiator keys, in display order — the single source of
    // truth for which rows exist and their order. The localized cell text lives
    // in i18n.{lang}.differentiators keyed by these strings.
    differentiators: z.array(z.string()).optional(),
    i18n: i18nCopy,
  }),
});

const forCollection = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/for' }),
  schema: z.object({
    slug: z.string(),
    profession: z.string(),
    painPoints: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    secondaryCta,
    i18n: i18nCopy,
  }),
});

export const collections = {
  compare,
  // Collection key is `for` in the content dir; exported under the same name.
  for: forCollection,
};

export { SUPPORTED_LANGS };
