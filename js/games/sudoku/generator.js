// Générateur de grilles Sudoku : solution unique garantie, difficulté mesurée par les techniques requises.
import { search, countSolutions, solveWithTechniques, format, solve } from './solver.js';

export const LEVEL_RATING = { easy: 1, medium: 2, hard: 3 };
const MIN_CLUES = { easy: 36, medium: 28, hard: 0 };

export function randomSolution(rng) {
  const empty = new Int8Array(81);
  return solve(empty, rng);
}

/**
 * Génère une grille du niveau demandé.
 * Principe : on retire des cases au hasard tant que la solution reste unique et que la grille reste
 * résoluble sans deviner avec des techniques de niveau <= cible. On accepte si la technique la plus
 * dure requise correspond exactement à la cible.
 */
export function generate(level, rng, { maxAttempts = 400 } = {}) {
  const target = LEVEL_RATING[level];
  if (!target) throw new Error(`niveau inconnu : ${level}`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const sol = randomSolution(rng);
    const puz = Int8Array.from(sol);
    const order = rng.shuffle(Array.from({ length: 81 }, (_, i) => i));
    let clues = 81;
    for (const i of order) {
      const keep = puz[i];
      puz[i] = 0;
      if (clues - 1 < MIN_CLUES[level] || countSolutions(puz, 2) !== 1) {
        puz[i] = keep;
        continue;
      }
      const r = solveWithTechniques(puz, { maxLevel: target });
      if (!r.solved) {
        puz[i] = keep;
        continue;
      }
      clues--;
    }
    const final = solveWithTechniques(puz, { maxLevel: target });
    if (final.solved && final.rating === target) {
      return { puzzle: format(puz), solution: format(sol), rating: target, clues, attempts: attempt };
    }
  }
  throw new Error(`échec de génération (${level})`);
}
