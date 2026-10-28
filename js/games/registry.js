// Les 9 jeux de la page d'accueil, dans l'ordre d'affichage (grille 3×3).
// ready=false -> écran provisoire. Passer à true quand le module du jeu est livré.
export const LEVELS = ['easy', 'medium', 'hard'];

export const GAMES = [
  { id: 'sudoku', phase: 1, ready: false },
  { id: 'starbattle', phase: 1, ready: false },
  { id: 'nonogram', phase: 1, ready: false },
  { id: 'futoshiki', phase: 2, ready: false },
  { id: 'hashi', phase: 3, ready: false },
  { id: 'takuzu', phase: 2, ready: false },
  { id: 'kakuro', phase: 3, ready: false },
  { id: 'akari', phase: 3, ready: false },
  { id: 'tents', phase: 2, ready: false },
];

export const getGame = (id) => GAMES.find((g) => g.id === id) ?? null;
export const isLevel = (l) => LEVELS.includes(l);

/**
 * Charge le module d'un jeu. Contrat d'un module :
 *   export default { mount(container, ctx) -> { destroy() } }
 * ctx : { gameId, level, seed, rng, restore, settings(), onSettings(fn)->unsub,
 *         save(state), complete(), isPaused(), t }
 */
export async function importGame(id) {
  const game = getGame(id);
  if (game?.ready) return (await import(`./${id}/index.js`)).default;
  return (await import('./placeholder.js')).default;
}
