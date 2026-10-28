import fr from '../i18n/fr.js';
import en from '../i18n/en.js';

const DICTS = { fr, en };
let current = 'fr';

export function resolveLang(pref, navLang = '') {
  if (pref === 'fr' || pref === 'en') return pref;
  return String(navLang).toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function setLanguage(pref) {
  current = resolveLang(pref, typeof navigator !== 'undefined' ? navigator.language : '');
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

export const lang = () => current;

export function t(key, params) {
  let s = DICTS[current][key] ?? DICTS.fr[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  return s;
}
