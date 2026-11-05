/**
 * Kinglet speaks English by default and French as a second language.
 * Strings are written in place as pairs: t('Reload', 'Recharger'). One language per process
 * (the app's main process, its window, the MCP server), set from the user's settings.
 */
export type Language = 'en' | 'fr';

let current: Language = 'en';

export function setLanguage(lang: Language | string | null | undefined) {
  current = lang === 'fr' ? 'fr' : 'en';
}

export const getLanguage = (): Language => current;

/** The English or French text, depending on the language. */
export const t = (en: string, fr: string): string => (current === 'fr' ? fr : en);

/** Locale for dates and numbers. */
export const locale = () => (current === 'fr' ? 'fr-FR' : 'en-US');

/** "3 min ago" / "il y a 3 min". */
export function ago(ms: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return t('just now', 'à l’instant');
  if (m < 60) return t(`${m} min ago`, `il y a ${m} min`);
  const h = Math.round(m / 60);
  if (h < 24) return t(`${h} h ago`, `il y a ${h} h`);
  const d = Math.round(h / 24);
  return t(`${d} d ago`, `il y a ${d} j`);
}

/** "system" (or anything unknown) follows the computer's locale: French for fr-*, English otherwise. */
export function resolveLanguage(pref: string | null | undefined, systemLocale: string | null | undefined): Language {
  if (pref === 'en' || pref === 'fr') return pref;
  return systemLocale?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
