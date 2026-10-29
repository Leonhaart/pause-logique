// Générateur Futoshiki : carré latin aléatoire, tous les signes et tous les chiffres, puis retrait
// d'indices tant que la grille reste résoluble par les techniques du niveau visé.
import { randomLatin, solveWithTechniques, countSolutions } from './solver.js';

export const SIZES = [4, 5, 6];
export const DIFFS = ['easy', 'medium', 'hard'];
// Nombre minimal de chiffres donnés (pour garder quelques repères).
export const MIN_GIVENS = { 4: 1, 5: 2, 6: 2 };

/** Difficulté d'après solveWithTechniques ; null si non résolue. */
export function classify(N, r) {
  if (!r.solved) return null;
  if (r.rating <= 2) return 'easy';
  if (r.rating <= 4) return 'medium';
  return 'hard';
}

export function generate(N, level, rng, { maxTries = 200, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  const maxLevel = { easy: 2, medium: 4, hard: 5 }[level];
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const sol = randomLatin(N, rng);
    const rel = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const a = r * N + c;
        if (c < N - 1) rel.push(sol[a] < sol[a + 1] ? [a, a + 1] : [a + 1, a]);
        if (r < N - 1) rel.push(sol[a] < sol[a + N] ? [a, a + N] : [a + N, a]);
      }
    }
    const p = { N, giv: Int8Array.from(sol), rel };
    // éléments retirables : chiffre (i) ou signe (index dans rel)
    const items = rng.shuffle([...Array(N * N).keys()].map((i) => ['g', i]).concat(rel.map((_, j) => ['r', j])));
    const gone = new Set();
    let givens = N * N;
    for (const [kind, x] of items) {
      if (kind === 'g') {
        if (givens <= MIN_GIVENS[N]) continue;
        const keep = p.giv[x];
        p.giv[x] = 0;
        const q = { N, giv: p.giv, rel: rel.filter((_, j) => !gone.has(j)) };
        const ok = level === 'hard' ? countSolutions(q, 2).count === 1 : solveWithTechniques(q, { maxLevel }).solved;
        if (ok) givens--; else p.giv[x] = keep;
      } else {
        gone.add(x);
        const q = { N, giv: p.giv, rel: rel.filter((_, j) => !gone.has(j)) };
        const ok = level === 'hard' ? countSolutions(q, 2).count === 1 : solveWithTechniques(q, { maxLevel }).solved;
        if (!ok) gone.delete(x);
      }
    }
    const puz = { N, giv: p.giv.slice(), rel: rel.filter((_, j) => !gone.has(j)) };
    const r = solveWithTechniques(puz, { maxLevel: 5 });
    if (classify(N, r) === level) return { puz, sol, rating: r.rating, counts: r.counts, tries: k + 1 };
  }
  return null;
}
