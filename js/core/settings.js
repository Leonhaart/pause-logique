import { storage } from './storage.js';

export const DEFAULTS = Object.freeze({
  lang: 'auto', // auto | fr | en
  theme: 'auto', // auto | dark | light
  timer: true,
  errors: 'ask', // never | ask | live  (aucune pénalité dans tous les cas)
  hints: true,
});

let state = { ...DEFAULTS, ...(storage.get('settings', {}) || {}) };
const subs = new Set();

export const getSettings = () => ({ ...state });

export function applySettings() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = state.theme;
}

export function setSetting(key, value) {
  state = { ...state, [key]: value };
  storage.set('settings', state);
  applySettings();
  for (const fn of subs) fn(getSettings(), key);
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
