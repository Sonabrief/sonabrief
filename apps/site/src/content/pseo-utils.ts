// Shared helpers for the pSEO collections (compare / for).
// Keeps the per-language availability logic in ONE place so the route files
// and BaseLayout integration stay thin.

import { SUPPORTED_LANGS } from './config';

type LangCode = (typeof SUPPORTED_LANGS)[number];

interface I18nContainer {
  // Each key may or may not be present; `en` is always present per schema.
  [lang: string]: unknown;
}

/**
 * The set of languages an entry is actually translated into, in canonical
 * order (en first). Derived purely from which i18n keys exist.
 */
export function getAvailableLangs(i18n: I18nContainer): LangCode[] {
  return SUPPORTED_LANGS.filter((l) => i18n[l] != null);
}

/**
 * Resolve the copy block for a language, falling back to EN if that language
 * isn't translated yet. The second return value tells the caller whether a
 * fallback happened, so the page can emit `noindex` for the untranslated URL.
 */
export function resolveCopy<T>(
  i18n: Record<string, T | undefined>,
  lang: LangCode
): { copy: T; isFallback: boolean } {
  const own = i18n[lang];
  if (own != null) return { copy: own, isFallback: false };
  // en is guaranteed by the schema.
  return { copy: i18n.en as T, isFallback: true };
}

/**
 * Build the hreflang href set BaseLayout should emit for a pSEO page: only the
 * languages this entry is translated into. Path is the section path WITHOUT a
 * language prefix, e.g. "compare/otter-alternative".
 */
export function buildAvailableHreflangs(
  i18n: I18nContainer,
  pathWithoutLang: string,
  base = 'https://sonabrief.com'
): { lang: string; href: string }[] {
  return getAvailableLangs(i18n).map((l) => ({
    lang: l,
    href: l === 'en' ? `${base}/${pathWithoutLang}/` : `${base}/${l}/${pathWithoutLang}/`,
  }));
}

export type { LangCode };
