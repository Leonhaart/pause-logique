import { storage } from './storage.js';

// Une sauvegarde par jeu : { level, seed, elapsed, state, at }
export const saveGame = (gameId, data) => storage.set('save:' + gameId, data);
export const loadSave = (gameId) => storage.get('save:' + gameId, null);
export const clearSave = (gameId) => storage.remove('save:' + gameId);

/** Sauvegarde la plus récente parmi les jeux donnés. */
export function latestSave(gameIds) {
  let best = null;
  for (const gameId of gameIds) {
    const data = loadSave(gameId);
    if (data && (!best || (data.at ?? 0) > (best.data.at ?? 0))) best = { gameId, data };
  }
  return best;
}
