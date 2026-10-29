import { growUnique, solveWithTechniques, formatPuz, geoOf } from './solver.js';

export const LEVELS = ['easy', 'medium', 'hard'];
export const SIZES = [6, 8, 10];
// [plancher, plafond] de cases blanches selon la taille et le niveau
const WHITES = {
  6: { easy: [11, 18], medium: [12, 18], hard: [12, 18] },
  8: { easy: [22, 36], medium: [24, 36], hard: [26, 36] },
  10: { easy: [34, 52], medium: [36, 52], hard: [42, 56] },
};

/** Niveau d'une grille unique : 1 facile, 2 moyen, 3+ difficile, 0 non résoluble par les techniques. */
export function rate(puz) {
  const r = solveWithTechniques(puz, { maxLevel: 4 });
  return r.solved ? r.rating : 0;
}
export const levelOf = (rating) => (rating <= 1 ? 'easy' : rating === 2 ? 'medium' : 'hard');

/** Facile : on pose des chiffres de départ jusqu'à ce que les techniques de base suffisent, puis on retire les inutiles. */
function addGivens(puz, vals, rng) {
  const { N } = puz;
  puz.given = new Int8Array(N * N);
  const g = geoOf(puz);
  for (let guard = 0; guard < 60; guard++) {
    const r = solveWithTechniques(puz, { maxLevel: 1 });
    if (r.solved) break;
    const open = g.whites.filter((i) => !r.vals[i] && !puz.given[i]);
    if (!open.length) return null;
    const i = open[rng.int(open.length)];
    puz.given[i] = vals[i];
  }
  if (!solveWithTechniques(puz, { maxLevel: 1 }).solved) return null;
  for (const i of rng.shuffle(g.whites.filter((k) => puz.given[k]))) {
    const keep = puz.given[i];
    puz.given[i] = 0;
    if (!solveWithTechniques(puz, { maxLevel: 1 }).solved) puz.given[i] = keep;
  }
  const n = g.whites.filter((i) => puz.given[i]).length;
  return n <= Math.ceil(g.whites.length * 0.35) ? n : null;
}

/** Une grille du niveau demandé, ou null. La grille grandit case par case ; on s'arrête dès que le niveau voulu est atteint. */
export function tryGenerate(N, level, rng, deadlineMs = 8000) {
  const [min, max] = WHITES[N][level];
  let easy = null;
  const found = growUnique(N, max, min, rng, {
    deadlineMs,
    accept: (puz, count, vals) => {
      const r = rate(puz);
      if (!r) return false;
      if (level === 'easy') {
        if (r > 2) return false;
        const copy = { ...puz, given: new Int8Array(N * N) };
        if (addGivens(copy, vals, rng) == null) return false;
        easy = copy;
        return true;
      }
      return level === 'medium' ? r === 2 : r >= 3;
    },
  });
  if (!found) return null;
  if (level === 'easy') return { puz: formatPuz(easy), rating: 1 };
  return { puz: formatPuz(found.puz), rating: rate(found.puz) };
}

export function generate(N, level, rng, { maxTries = 400, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const g = tryGenerate(N, level, rng, Math.min(8000, deadlineMs));
    if (g) return g;
  }
  return null;
}
