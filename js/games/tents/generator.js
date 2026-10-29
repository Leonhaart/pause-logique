// Générateur Tents : configurations aléatoires (tentes puis arbres voisins) gardées si la solution est unique,
// puis classées par les techniques nécessaires.
import { randomConfig, solveWithTechniques, countSolutions } from './solver.js';

export const SIZES = [6, 8, 10];
export const DIFFS = ['easy', 'medium', 'hard'];
// Nombre d'arbres par taille (fourchette).
export const TREES = { 6: [6, 8], 8: [11, 14], 10: [17, 22] };

/** Difficulté d'après solveWithTechniques ; null si non résolue. */
export function classify(N, r) {
  if (!r.solved) return null;
  if (r.rating <= 2) return 'easy';
  if (r.rating <= 4) return 'medium';
  return 'hard';
}

export function generate(N, level, rng, { maxTries = 4000, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  const [lo, hi] = TREES[N];
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const cfg = randomConfig(N, lo + rng.int(hi - lo + 1), rng);
    if (!cfg) continue;
    const r = solveWithTechniques(cfg.puz, { maxLevel: 5 });
    if (classify(N, r) !== level) continue;
    if (countSolutions(cfg.puz, 2).count !== 1) continue;
    return { ...cfg, rating: r.rating, counts: r.counts, tries: k + 1 };
  }
  return null;
}
