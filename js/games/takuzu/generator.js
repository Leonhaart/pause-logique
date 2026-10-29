// Générateur Takuzu : solution aléatoire, puis retrait de cases tant que la grille reste résoluble
// par les techniques du niveau visé (ou à solution unique pour le niveau difficile).
import { randomSolution, solveWithTechniques, countSolutions } from './solver.js';

export const SIZES = [6, 8, 10];
export const DIFFS = ['easy', 'medium', 'hard'];

/** Difficulté d'après solveWithTechniques ; null si non résolue. */
export function classify(N, r) {
  if (!r.solved) return null;
  if (r.rating <= 2) return 'easy';
  if (r.rating <= 4) return 'medium';
  return 'hard';
}

export function generate(N, level, rng, { maxTries = 400, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  const maxLevel = { easy: 2, medium: 4, hard: 5 }[level];
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const sol = randomSolution(N, rng);
    if (!sol) continue;
    const puz = sol.slice();
    for (const i of rng.shuffle([...Array(N * N).keys()])) {
      const keep = puz[i];
      puz[i] = -1;
      const ok = level === 'hard' ? countSolutions(puz, N, 2).count === 1 : solveWithTechniques(puz, N, { maxLevel }).solved;
      if (!ok) puz[i] = keep;
    }
    const r = solveWithTechniques(puz, N, { maxLevel: 5 });
    if (classify(N, r) === level) return { puz, sol, rating: r.rating, counts: r.counts, tries: k + 1 };
  }
  return null;
}
