// Générateur Nonogram : motifs symétriques (ou images fournies), réparation jusqu'à l'unicité, notation par les techniques.
import { cluesOf, solveAlt, solveWithTechniques } from './solver.js';

export const SIZES = [5, 10, 15];
export const DIFFS = ['easy', 'medium', 'hard'];

/** Motif aléatoire symétrique gauche-droite, légèrement lissé pour ressembler à une silhouette. */
export function motif(N, rng) {
  const p = 0.5 + rng.next() * 0.2;
  const g = new Uint8Array(N * N);
  const half = Math.ceil(N / 2);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < half; c++) {
      const v = rng.next() < p ? 1 : 0;
      g[r * N + c] = v;
      g[r * N + (N - 1 - c)] = v;
    }
  }
  if (N >= 10) {
    const s = g.slice();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        let n = 0;
        let t = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < N && cc >= 0 && cc < N) { t++; n += g[rr * N + cc]; }
          }
        }
        s[r * N + c] = n * 2 > t ? 1 : n * 2 < t ? 0 : g[r * N + c];
      }
    }
    return s;
  }
  return g;
}

export const density = (g) => g.reduce((a, b) => a + b, 0) / g.length;

/** Corrige un motif ambigu en inversant des cases qui différencient deux solutions. null si échec. */
export function repair(grid, N, rng, maxFlips = 40) {
  const g = Uint8Array.from(grid);
  for (let k = 0; k <= maxFlips; k++) {
    const { rows, cols } = cluesOf(g, N);
    const alt = solveAlt(rows, cols, N, g);
    if (!alt) return g;
    const diff = [];
    for (let i = 0; i < g.length; i++) if (alt[i] !== g[i]) diff.push(i);
    const i = diff[rng.int(diff.length)];
    g[i] ^= 1;
  }
  return null;
}

// Seuils par taille : « difficile » à partir de hard étapes de ligne complète (un essai logique en compte 3),
// « facile » jusqu'à easyBounds étapes de niveau « bornes ».
export const THRESHOLDS = { 5: { hard: 2, easyBounds: 2 }, 10: { hard: 3, easyBounds: 5 }, 15: { hard: 4, easyBounds: 7 } };

/** easy / medium / hard d'après le résultat de solveWithTechniques ; null si non résolu. */
export function classify(N, r) {
  if (!r.solved) return null;
  const c = r.counts;
  if (r.rating <= 1 || (r.rating === 2 && (c.bounds || 0) <= THRESHOLDS[N].easyBounds)) return 'easy';
  const score = (c.line || 0) + 3 * (c.trial || 0);
  return r.rating >= 4 || score >= THRESHOLDS[N].hard ? 'hard' : 'medium';
}

/** Motif acceptable : densité raisonnable, pas de ligne vide ou pleine en excès. */
export function acceptable(g, N, lenient = false) {
  const d = density(g);
  if (d < 0.38 || d > 0.72) return false;
  let degenerate = 0;
  for (let k = 0; k < N; k++) {
    let r = 0;
    let c = 0;
    for (let i = 0; i < N; i++) { r += g[k * N + i]; c += g[i * N + k]; }
    if (r === 0 || r === N) degenerate++;
    if (c === 0 || c === N) degenerate++;
  }
  return degenerate <= Math.floor(N / (lenient ? 3 : 5));
}

/** Génère une grille (Uint8Array) pour (taille, difficulté). source(rng) peut fournir des images ; sinon motifs symétriques. */
export function generate(N, level, rng, { maxTries = 20000, deadlineMs = Infinity, source = null } = {}) {
  const t0 = Date.now();
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const raw = source ? source(rng) : motif(N, rng);
    if (!raw || !acceptable(raw, N)) continue;
    const grid = repair(raw, N, rng);
    if (!grid || !acceptable(grid, N)) continue;
    const { rows, cols } = cluesOf(grid, N);
    const r = solveWithTechniques(rows, cols, N);
    if (classify(N, r) === level) return { grid, rating: r.rating, tries: k + 1 };
  }
  return null;
}

/** Bits d'une grille en hexadécimal (ligne par ligne) et retour. */
export function packGrid(g) {
  let out = '';
  for (let i = 0; i < g.length; i += 4) {
    let v = 0;
    for (let b = 0; b < 4; b++) v = (v << 1) | (g[i + b] ? 1 : 0);
    out += v.toString(16);
  }
  return out;
}
export function unpackGrid(hex, N) {
  const g = new Uint8Array(N * N);
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    for (let b = 0; b < 4; b++) {
      const idx = i * 4 + b;
      if (idx < g.length) g[idx] = (v >> (3 - b)) & 1;
    }
  }
  return g;
}
