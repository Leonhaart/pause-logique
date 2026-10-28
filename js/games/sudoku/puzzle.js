import { BANK } from './bank.js';
import { randomTransform, applyTransform } from './transform.js';

export const BANK_SIZES = { easy: 25, medium: 50, hard: 25 };

/**
 * Grille jouée pour un niveau et un générateur aléatoire à graine : une grille de la banque,
 * puis une transformation aléatoire (chiffres, lignes, colonnes, transposition).
 * Même graine = même grille.
 */
export function puzzleFor(level, rng) {
  const list = BANK[level];
  const index = rng.int(list.length);
  const [p, s] = list[index];
  const tf = randomTransform(rng);
  return { puzzle: applyTransform(p, tf), solution: applyTransform(s, tf), index };
}
