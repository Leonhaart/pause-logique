import { randomConfig, countSolutions, solveWithTechniques, formatPuz } from './solver.js';

export const LEVELS = ['easy', 'medium', 'hard'];
export const SIZES = [7, 9, 12];
// densité de murs essayée selon la taille
const RATE = { 7: [0.26, 0.34], 9: [0.26, 0.34], 12: [0.26, 0.34] };

/** Niveau d'une grille unique : 1 facile, 2 moyen, 3 difficile, 0 non résoluble par les techniques. */
export function rate(puz) {
  const r = solveWithTechniques(puz, { maxLevel: 4 });
  return r.solved ? r.rating : 0;
}
export const levelOf = (rating) => (rating <= 1 ? 'easy' : rating === 2 ? 'medium' : 'hard');

/** Retire des chiffres tant que la grille reste unique et de niveau <= cible. */
function strip(cfg, target, rng) {
  const { puz } = cfg;
  const maxLevel = target === 'easy' ? 1 : target === 'medium' ? 2 : 4;
  const order = rng.shuffle(puz.num.map((v, i) => i).filter((i) => puz.wall[i] && puz.num[i] >= 0));
  for (const i of order) {
    const keep = puz.num[i];
    puz.num[i] = -1;
    if (countSolutions(puz, 2).count !== 1 || !solveWithTechniques(puz, { maxLevel }).solved) puz.num[i] = keep;
  }
  return puz;
}

/** Une grille du niveau demandé, ou null. */
export function tryGenerate(N, level, rng) {
  const [a, b] = RATE[N];
  const cfg = randomConfig(N, a + (b - a) * rng.next(), rng);
  if (!cfg) return null;
  if (countSolutions(cfg.puz, 2).count !== 1) return null;
  const puz = strip(cfg, level, rng);
  const rating = rate(puz);
  if (!rating || levelOf(rating) !== level) return null;
  return { puz: formatPuz(puz), rating };
}

export function generate(N, level, rng, { maxTries = 4000, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const g = tryGenerate(N, level, rng);
    if (g) return g;
  }
  return null;
}
