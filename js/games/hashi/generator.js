import { randomConfig, countSolutions, solveWithTechniques, formatPuz } from './solver.js';

export const LEVELS = ['easy', 'medium', 'hard'];
export const SIZES = [7, 9, 11];
// nombre d'îles essayé selon la taille
const ISLANDS = { 7: [8, 12], 9: [13, 20], 11: [20, 30] };

/** Niveau d'une grille unique : 1 facile, 2 moyen, 3+ difficile, 0 non résoluble par les techniques. */
export function rate(puz) {
  const r = solveWithTechniques(puz, { maxLevel: 4 });
  return r.solved ? r.rating : 0;
}
export const levelOf = (rating) => (rating <= 1 ? 'easy' : rating === 2 ? 'medium' : 'hard');

/** Une grille du niveau demandé, ou null. */
export function tryGenerate(N, level, rng) {
  const [a, b] = ISLANDS[N];
  const cfg = randomConfig(N, a + rng.int(b - a + 1), 0.15 + 0.4 * rng.next(), rng);
  if (!cfg) return null;
  if (countSolutions(cfg.puz, 2).count !== 1) return null;
  const rating = rate(cfg.puz);
  if (!rating || levelOf(rating) !== level) return null;
  return { puz: formatPuz(cfg.puz), rating };
}

export function generate(N, level, rng, { maxTries = 20000, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const g = tryGenerate(N, level, rng);
    if (g) return g;
  }
  return null;
}
