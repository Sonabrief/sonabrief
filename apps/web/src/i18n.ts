import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import it from './locales/it.json'
import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import de from './locales/de.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { it: { translation: it }, en: { translation: en }, fr: { translation: fr }, es: { translation: es }, de: { translation: de } },
    fallbackLng: 'it',
    supportedLngs: ['it', 'en', 'fr', 'es', 'de'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'sb_language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  })

export default i18n
