import { storage } from './storage.js';

const KEY = 'stats';
const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function loadStats() {
  const s = storage.get(KEY);
  return s && s.games ? s : { games: {}, days: [] };
}

/** Enregistre une grille terminée. ms = null si le minuteur était désactivé. */
export function recordWin(gameId, level, ms, today = dayKey(new Date())) {
  const s = loadStats();
  const g = (s.games[gameId] ??= {});
  const l = (g[level] ??= { done: 0, timed: 0, sum: 0, best: null });
  l.done += 1;
  let record = false;
  if (ms != null) {
    l.timed += 1;
    l.sum += ms;
    if (l.best == null || ms < l.best) {
      record = l.best != null; // le premier temps n'est pas un « record »
      l.best = ms;
    }
  }
  if (s.days[s.days.length - 1] !== today) s.days.push(today);
  s.days = s.days.slice(-400);
  storage.set(KEY, s);
  return { record };
}

export function levelStats(gameId, level) {
  return loadStats().games[gameId]?.[level] ?? { done: 0, timed: 0, sum: 0, best: null };
}

/** Jours consécutifs jusqu'à aujourd'hui (ou hier si rien aujourd'hui). */
export function currentStreak(days, today = dayKey(new Date())) {
  const set = new Set(days);
  const d = parseDay(today);
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function resetStats() {
  storage.remove(KEY);
}
