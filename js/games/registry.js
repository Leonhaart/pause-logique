import { t } from '../core/i18n.js';

// Les 9 jeux de la page d'accueil, dans l'ordre d'affichage (grille 3×3).
// ready=false -> écran provisoire. Passer à true quand le module du jeu est livré.
export const LEVELS = ['easy', 'medium', 'hard'];

export const GAMES = [
  { id: 'sudoku', phase: 1, ready: true },
  { id: 'starbattle', phase: 1, ready: true, sizes: [8, 10, 12] },
  { id: 'nonogram', phase: 1, ready: true, sizes: [5, 10, 15] },
  { id: 'futoshiki', phase: 2, ready: true, sizes: [4, 5, 6] },
  { id: 'hashi', phase: 3, ready: false },
  { id: 'takuzu', phase: 2, ready: true, sizes: [6, 8, 10] },
  { id: 'kakuro', phase: 3, ready: false },
  { id: 'akari', phase: 3, ready: false },
  { id: 'tents', phase: 2, ready: true, sizes: [6, 8, 10] },
];

// Jeux avec choix de taille : le niveau est alors « difficulté-taille » (ex. hard-12).
export const sizesOf = (id) => GAMES.find((g) => g.id === id)?.sizes ?? null;
export const makeLevel = (diff, size) => (size ? `${diff}-${size}` : diff);
export function parseLevel(level) {
  const [diff, size] = String(level).split('-');
  return { diff, size: size ? +size : null };
}
export const levelKeys = (id) => {
  const sizes = sizesOf(id);
  return sizes ? sizes.flatMap((n) => LEVELS.map((d) => makeLevel(d, n))) : LEVELS;
};
export function levelLabel(level) {
  const { diff, size } = parseLevel(level);
  return size ? `${t(`level.${diff}`)} ${size}×${size}` : t(`level.${diff}`);
}
export function randomLevel(id, size = null) {
  const sizes = sizesOf(id);
  const n = sizes ? size ?? sizes[Math.floor(Math.random() * sizes.length)] : null;
  return makeLevel(LEVELS[Math.floor(Math.random() * LEVELS.length)], n);
}

export const getGame = (id) => GAMES.find((g) => g.id === id) ?? null;
export const isLevel = (l) => LEVELS.includes(parseLevel(l).diff);

/**
 * Charge le module d'un jeu. Contrat d'un module :
 *   export default { mount(container, ctx) -> { destroy() } }
 * ctx : { gameId, level, seed, rng, restore, settings(), onSettings(fn)->unsub,
 *         save(state), complete(), isPaused(), t }
 */
/** Charge la feuille de style d'un jeu si la page ne l'a pas déjà (page en cache plus ancienne que le jeu). */
function ensureCss(id) {
  const href = new URL(`../../css/${id}.css`, import.meta.url).href;
  if ([...document.styleSheets].some((s) => s.href === href) || document.querySelector(`link[href$="css/${id}.css"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
    setTimeout(resolve, 3000);
  });
}

export async function importGame(id) {
  const game = getGame(id);
  if (game?.ready) {
    const [mod] = await Promise.all([import(`./${id}/index.js`), ensureCss(id)]);
    return mod.default;
  }
  return (await import('./placeholder.js')).default;
}
