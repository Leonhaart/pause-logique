// Générateur Slitherlink : boucle aléatoire, tous les chiffres, puis on retire des chiffres au hasard
// tant que la grille reste résolvable au niveau visé (donc à solution unique).
import { geoOf, newState, solvable, solveWithTechniques } from './solver.js';

export const LEVELS = ['easy', 'medium', 'hard'];
export const SIZES = [5, 7, 10];
const CAP = { easy: 1, medium: 2, hard: 3 };

/** Niveau de technique nécessaire (1 à 3), ou -1 si les techniques ne suffisent pas. */
export function rate(p) {
  const r = solveWithTechniques(p, { maxLevel: 3 });
  return r.solved ? r.rating : -1;
}
export const levelOf = (rating) => (rating <= 1 ? 'easy' : rating === 2 ? 'medium' : 'hard');

/** Région intérieure aléatoire dont le contour est une seule boucle simple. */
export function randomLoop(N, rng, fraction) {
  const inside = new Uint8Array(N * N);
  const at = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? inside[r * N + c] : 0);
  inside[rng.int(N * N)] = 1;
  let area = 1;
  const target = Math.round(N * N * fraction);
  const holeFree = () => {
    // toute case extérieure doit être reliée au bord par des cases extérieures
    const seen = new Uint8Array(N * N);
    const stack = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if ((r === 0 || c === 0 || r === N - 1 || c === N - 1) && !inside[r * N + c]) { seen[r * N + c] = 1; stack.push(r * N + c); }
    }
    while (stack.length) {
      const i = stack.pop();
      const r = Math.floor(i / N);
      const c = i % N;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const j = rr * N + cc;
        if (!inside[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    for (let i = 0; i < N * N; i++) if (!inside[i] && !seen[i]) return false;
    return true;
  };
  const pinch = (r, c) => {
    for (const [dr, dc] of [[0, 0], [0, -1], [-1, 0], [-1, -1]]) {
      const a = at(r + dr, c + dc);
      const b = at(r + dr, c + dc + 1);
      const d = at(r + dr + 1, c + dc);
      const e = at(r + dr + 1, c + dc + 1);
      if (a === e && b === d && a !== b) return true;
    }
    return false;
  };
  for (let tries = 0; tries < 600 && area < target; tries++) {
    const cand = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!inside[r * N + c] && (at(r - 1, c) || at(r + 1, c) || at(r, c - 1) || at(r, c + 1))) cand.push([r, c]);
    }
    if (!cand.length) break;
    const [r, c] = cand[rng.int(cand.length)];
    inside[r * N + c] = 1;
    if (pinch(r, c) || !holeFree()) inside[r * N + c] = 0;
    else area++;
  }
  return inside;
}

/** Chiffres complets d'une région intérieure. */
function cluesOf(N, inside) {
  const g = geoOf(N);
  const clue = new Int8Array(N * N);
  const insideAt = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? inside[r * N + c] : 0);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const me = insideAt(r, c);
      let n = 0;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (insideAt(r + dr, c + dc) !== me) n++;
      clue[r * N + c] = n;
    }
  }
  return clue;
}

export function tryGenerate(N, level, rng) {
  const inside = randomLoop(N, rng, 0.42 + 0.2 * rng.next());
  const clue = cluesOf(N, inside);
  if (clue.some((v) => v > 3)) return null;
  const p = { N, clue };
  const L = CAP[level];
  if (!solvable(p, L)) return null;
  const order = Array.from({ length: N * N }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  for (const i of order) {
    const keep = clue[i];
    clue[i] = -1;
    if (!solvable(p, L)) clue[i] = keep;
  }
  const rt = rate(p);
  if (rt < 0 || levelOf(rt) !== level) return null;
  return { N, clue };
}

export function generate(N, level, rng, { maxTries = 400, deadlineMs = Infinity } = {}) {
  const t0 = Date.now();
  for (let k = 0; k < maxTries && Date.now() - t0 < deadlineMs; k++) {
    const g = tryGenerate(N, level, rng);
    if (g) return { puz: Array.from(g.clue, (v) => (v < 0 ? '.' : String(v))).join(''), N };
  }
  return null;
}
