// Générateur Star Battle : solution aléatoire, régions connexes autour des étoiles,
// réglage local jusqu'à l'unicité, puis notation par les techniques.
import { geo, countSolutions, solveAlt, solveWithTechniques } from './solver.js';

export const SIZES = [8, 10, 12];
export const DIFFS = ['easy', 'medium', 'hard'];
// Seuils (nombre de déductions par essai logique ou ensemble de 3) par taille : { medium: au plus, hard: au moins }.
export const THRESHOLDS = { 8: { medium: 4, hard: 6 }, 10: { medium: 5, hard: 8 }, 12: { medium: 6, hard: 10 } };

/** Difficulté d'une grille d'après le résultat de solveWithTechniques ; null si hors des plages (ou non résolue). */
export function classify(N, r) {
  if (!r.solved) return null;
  if (r.rating <= 1) return 'easy';
  const c = r.counts;
  const heavy = (c.trial1 || 0) + (c.set3 || 0) + 2 * ((c.trial2 || 0) + (c.set4 || 0));
  const th = THRESHOLDS[N];
  if (r.rating >= 4 || heavy >= th.hard) return 'hard';
  if (r.rating === 2 || heavy <= th.medium) return 'medium';
  return null;
}

/** Placement aléatoire d'une étoile par ligne et colonne, sans contact. */
export function randomStars(N, rng) {
  const sol = new Array(N).fill(-1);
  const used = new Array(N).fill(false);
  const rec = (r) => {
    if (r === N) return true;
    for (const c of rng.shuffle([...Array(N).keys()])) {
      if (used[c] || (r > 0 && Math.abs(c - sol[r - 1]) <= 1)) continue;
      used[c] = true;
      sol[r] = c;
      if (rec(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  rec(0);
  return sol;
}

/** Croissance aléatoire de N régions depuis les étoiles. */
function growRegions(N, sol, rng) {
  const { NN, row, col } = geo(N);
  const reg = new Int8Array(NN).fill(-1);
  const stars = sol.map((c, r) => r * N + c);
  const ids = rng.shuffle([...Array(N).keys()]);
  stars.forEach((cell, k) => (reg[cell] = ids[k]));
  const nb4 = (i) => {
    const a = [];
    if (row[i] > 0) a.push(i - N);
    if (row[i] < N - 1) a.push(i + N);
    if (col[i] > 0) a.push(i - 1);
    if (col[i] < N - 1) a.push(i + 1);
    return a;
  };
  const frontier = new Set();
  for (const s of stars) for (const j of nb4(s)) if (reg[j] < 0) frontier.add(j);
  while (frontier.size) {
    const arr = [...frontier];
    const c = arr[rng.int(arr.length)];
    const regs = nb4(c).filter((j) => reg[j] >= 0).map((j) => reg[j]);
    reg[c] = regs[rng.int(regs.length)];
    frontier.delete(c);
    for (const j of nb4(c)) if (reg[j] < 0) frontier.add(j);
  }
  return { reg, stars: new Set(stars), nb4 };
}

function stillConnected(reg, g, skip, nb4, N) {
  const cells = [];
  for (let i = 0; i < reg.length; i++) if (reg[i] === g && i !== skip) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const x = stack.pop();
    for (const j of nb4(x)) if (j !== skip && reg[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
  }
  return seen.size === cells.length;
}

/**
 * Une grille à solution unique (ou null si l'essai échoue).
 * Tant qu'une autre solution existe, on fusionne une de ses cases dans une région voisine
 * qui contient déjà une autre de ses étoiles : cette solution parasite devient invalide.
 */
export function layoutUnique(N, rng, { rounds = 300, stats } = {}) {
  const sol = randomStars(N, rng);
  const { reg, stars, nb4 } = growRegions(N, sol, rng);
  for (let it = 0; it < rounds; it++) {
    const alt = solveAlt(reg, N, sol);
    if (!alt) { if (stats) stats.ok = it; return { reg, sol }; }
    const altCells = alt.map((c, r) => r * N + c);
    let moves = [];
    for (const c of altCells) {
      if (stars.has(c)) continue;
      for (const j of nb4(c)) {
        const g = reg[j];
        if (g === reg[c]) continue;
        if (altCells.some((o) => o !== c && reg[o] === g)) moves.push([c, g]);
      }
    }
    moves = rng.shuffle(moves);
    let done = false;
    for (const [c, g] of moves) {
      if (!stillConnected(reg, reg[c], c, nb4, N)) continue;
      reg[c] = g;
      done = true;
      break;
    }
    if (!done) {
      // Aucune fusion possible : on remodèle un peu les frontières au hasard, puis on repart.
      for (let k = 0; k < 4; k++) {
        const c = rng.int(N * N);
        if (stars.has(c)) continue;
        const others = nb4(c).map((j) => reg[j]).filter((g) => g !== reg[c]);
        if (others.length && stillConnected(reg, reg[c], c, nb4, N)) reg[c] = others[rng.int(others.length)];
      }
    }
  }
  if (stats) stats.fail = 'rounds';
  return null;
}

/** Génère une grille pour (taille, difficulté) ; essaie jusqu'à `maxTries` mises en page. */
export function generate(N, level, rng, { maxTries = 4000, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const lay = layoutUnique(N, rng);
    if (!lay) continue;
    let r = solveWithTechniques(lay.reg, N, { maxLevel: 1 });
    if (level === 'easy') {
      if (r.solved) return { ...lay, rating: 1, tries: k + 1 };
      continue;
    }
    if (r.solved) continue;
    r = solveWithTechniques(lay.reg, N, { maxLevel: 5 });
    if (classify(N, r) === level) return { ...lay, rating: r.rating, tries: k + 1 };
  }
  return null;
}
