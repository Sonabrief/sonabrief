import type { TFunction } from 'i18next'

export function getProfessionLabel(
  slugOrLegacy: string | null | undefined,
  t: TFunction
): string {
  if (!slugOrLegacy) return ''
  const key = `onboarding.profession_labels.${slugOrLegacy}`
  const translated = t(key)
  if (translated === key) return slugOrLegacy
  return translated
}
