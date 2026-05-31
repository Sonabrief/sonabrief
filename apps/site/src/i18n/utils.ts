export function getLang(url: URL): string {
  const seg = url.pathname.split('/')[1];
  return ['it', 'fr', 'es', 'de'].includes(seg) ? seg : 'en';
}

export async function getTranslations(lang: string) {
  const modules: Record<string, () => Promise<any>> = {
    en: () => import('./en.json'),
    it: () => import('./it.json'),
    fr: () => import('./fr.json'),
    es: () => import('./es.json'),
    de: () => import('./de.json'),
  };
  const mod = await (modules[lang] ?? modules['en'])();
  return mod.default ?? mod;
}
