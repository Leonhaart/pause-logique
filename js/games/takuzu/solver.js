// Takuzu : solveur d'unicité et moteur de techniques.
// Règles : autant de 0 que de 1 par ligne et par colonne, jamais trois identiques à la suite,
// deux lignes (ou deux colonnes) identiques sont interdites.
//
// Grille : Int8Array, -1 vide, 0 ou 1. Lignes 0..N-1, colonnes N..2N-1.
// Techniques (niveau) : run 1 (paire ou trou), quota 2 (moitié atteinte), line 3 (toutes les
// complétions possibles d'une ligne), unique 4 (idem sans copier une ligne complète), trial 5 (essai logique).

const CACHE = new Map();
export function geo(N) {
  let g = CACHE.get(N);
  if (g) return g;
  const lineCells = [];
  for (let r = 0; r < N; r++) lineCells.push(Array.from({ length: N }, (_, c) => r * N + c));
  for (let c = 0; c < N; c++) lineCells.push(Array.from({ length: N }, (_, r) => r * N + c));
  // motifs valides d'une ligne : bit j = valeur de la case j
  const patterns = [];
  for (let m = 0; m < 1 << N; m++) {
    let ones = 0;
    let ok = true;
    for (let j = 0; j < N; j++) {
      ones += (m >> j) & 1;
      if (j >= 2) {
        const a = (m >> j) & 1;
        if (a === ((m >> (j - 1)) & 1) && a === ((m >> (j - 2)) & 1)) { ok = false; break; }
      }
    }
    if (ok && ones === N / 2) patterns.push(m);
  }
  g = { N, NN: N * N, lineCells, patterns };
  CACHE.set(N, g);
  return g;
}

export const parsePuz = (s) => Int8Array.from(s, (ch) => (ch === '.' ? -1 : +ch));
export const formatPuz = (g) => Array.from(g, (v) => (v < 0 ? '.' : String(v))).join('');

function lineInfo(g, N, u) {
  const { lineCells } = geo(N);
  let known = 0;
  let val = 0;
  let ones = 0;
  let zeros = 0;
  const cells = lineCells[u];
  for (let j = 0; j < N; j++) {
    const v = g[cells[j]];
    if (v < 0) continue;
    known |= 1 << j;
    if (v) { val |= 1 << j; ones++; } else zeros++;
  }
  return { known, val, ones, zeros, cells };
}

/** Une règle est déjà violée par les cases posées. */
export function broken(g, N) {
  const { lineCells } = geo(N);
  const half = N / 2;
  const complete = [new Set(), new Set()];
  for (let u = 0; u < 2 * N; u++) {
    const { known, val, ones, zeros, cells } = lineInfo(g, N, u);
    if (ones > half || zeros > half) return true;
    for (let j = 2; j < N; j++) {
      const a = g[cells[j]];
      if (a >= 0 && a === g[cells[j - 1]] && a === g[cells[j - 2]]) return true;
    }
    if (known === (1 << N) - 1) {
      const set = complete[u < N ? 0 : 1];
      if (set.has(val)) return true;
      set.add(val);
    }
  }
  return false;
}

function stepRun(g, N) {
  const { lineCells } = geo(N);
  for (let u = 0; u < 2 * N; u++) {
    const c = lineCells[u];
    for (let j = 0; j + 2 < N; j++) {
      const a = g[c[j]];
      const b = g[c[j + 1]];
      const d = g[c[j + 2]];
      if (a >= 0 && a === b && d < 0) return { tech: 'run', level: 1, cells: [[c[j + 2], 1 - a]], units: [u], focus: [c[j], c[j + 1]] };
      if (b >= 0 && b === d && a < 0) return { tech: 'run', level: 1, cells: [[c[j], 1 - b]], units: [u], focus: [c[j + 1], c[j + 2]] };
      if (a >= 0 && a === d && b < 0) return { tech: 'run', level: 1, cells: [[c[j + 1], 1 - a]], units: [u], focus: [c[j], c[j + 2]] };
    }
  }
  return null;
}

function stepQuota(g, N) {
  const half = N / 2;
  for (let u = 0; u < 2 * N; u++) {
    const { ones, zeros, cells } = lineInfo(g, N, u);
    if (ones + zeros === N) continue;
    if (ones === half || zeros === half) {
      const fill = ones === half ? 0 : 1;
      return { tech: 'quota', level: 2, cells: cells.filter((i) => g[i] < 0).map((i) => [i, fill]), units: [u] };
    }
  }
  return null;
}

/** Motifs encore possibles pour la ligne u ; exclut les lignes complètes du même sens si `unique`. */
function candidates(g, N, u, unique, completeMasks) {
  const { patterns } = geo(N);
  const { known, val } = lineInfo(g, N, u);
  const out = [];
  for (const p of patterns) {
    if ((p & known) !== val) continue;
    if (unique && completeMasks[u < N ? 0 : 1].has(p) && known !== (1 << N) - 1) continue;
    out.push(p);
  }
  return out;
}

function completeMasksOf(g, N) {
  const m = [new Set(), new Set()];
  for (let u = 0; u < 2 * N; u++) {
    const { known, val } = lineInfo(g, N, u);
    if (known === (1 << N) - 1) m[u < N ? 0 : 1].add(val);
  }
  return m;
}

/** Retourne un pas, { contra: true } si une ligne n'a plus de motif, ou null. */
function stepLine(g, N, unique) {
  const masks = unique ? completeMasksOf(g, N) : null;
  for (let u = 0; u < 2 * N; u++) {
    const { known, cells } = lineInfo(g, N, u);
    if (known === (1 << N) - 1) continue;
    const pats = candidates(g, N, u, unique, masks);
    if (!pats.length) return { contra: true };
    let and = (1 << N) - 1;
    let or = 0;
    for (const p of pats) { and &= p; or |= p; }
    const out = [];
    for (let j = 0; j < N; j++) {
      if ((known >> j) & 1) continue;
      if ((and >> j) & 1) out.push([cells[j], 1]);
      else if (!((or >> j) & 1)) out.push([cells[j], 0]);
    }
    if (out.length) return { tech: unique ? 'unique' : 'line', level: unique ? 4 : 3, cells: out, units: [u] };
  }
  return null;
}

const apply = (g, s) => { for (const [i, v] of s.cells) g[i] = v; };

/** Propage avec les techniques de niveau <= maxLevel (sans essai) ; true si impasse. */
function propagate(g, N, maxLevel) {
  for (let guard = 0; guard < 400; guard++) {
    if (broken(g, N)) return true;
    const s = findStep(g, N, maxLevel, false);
    if (!s) return false;
    if (s.contra) return true;
    apply(g, s);
  }
  return false;
}

function stepTrial(g, N) {
  for (let i = 0; i < g.length; i++) {
    if (g[i] >= 0) continue;
    for (const v of [0, 1]) {
      const t = g.slice();
      t[i] = v;
      if (propagate(t, N, 4)) {
        return { tech: 'trial', level: 5, cells: [[i, 1 - v]], units: [], focus: [i] };
      }
    }
  }
  return null;
}

/** Prochaine déduction de niveau <= maxLevel, la plus simple d'abord. */
export function findStep(g, N, maxLevel = 5, allowTrial = true) {
  let s = stepRun(g, N);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepQuota(g, N))) return s;
  if (maxLevel >= 3 && (s = stepLine(g, N, false))) return s;
  if (maxLevel >= 4 && (s = stepLine(g, N, true))) return s;
  if (maxLevel >= 5 && allowTrial && (s = stepTrial(g, N))) return s;
  return null;
}

/** Résout avec les techniques ; renvoie { solved, rating, counts, grid }. */
export function solveWithTechniques(puz, N, { maxLevel = 5 } = {}) {
  const g = puz.slice();
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (!g.includes(-1)) return { solved: !broken(g, N), rating, counts, grid: g };
    const s = findStep(g, N, maxLevel);
    if (!s || s.contra) return { solved: false, rating, counts, grid: g };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    apply(g, s);
  }
  return { solved: false, rating, counts, grid: g };
}

/** Nombre de solutions (plafonné à `limit`) et première solution trouvée. */
export function countSolutions(puz, N, limit = 2) {
  let count = 0;
  let first = null;
  const rec = (g) => {
    if (propagate(g, N, 4)) return false;
    const i = g.indexOf(-1);
    if (i < 0) {
      if (broken(g, N)) return false;
      count++;
      if (!first) first = g.slice();
      return count >= limit;
    }
    for (const v of [0, 1]) {
      const t = g.slice();
      t[i] = v;
      if (rec(t)) return true;
    }
    return false;
  };
  rec(puz.slice());
  return { count, sol: first };
}

/** Grille complète valide (tirage aléatoire), ou null. rng : { int, shuffle }. */
export function randomSolution(N, rng) {
  for (let k = 0; k < 50; k++) {
    const g = randomSolutionOnce(N, rng);
    if (g) return g;
  }
  return null;
}

function randomSolutionOnce(N, rng) {
  const { patterns } = geo(N);
  const rows = [];
  const colOnes = new Int8Array(N);
  const rec = (r) => {
    if (r === N) return true;
    for (const p of rng.shuffle(patterns.slice())) {
      if (rows.includes(p)) continue;
      let ok = true;
      for (let c = 0; c < N && ok; c++) {
        const v = (p >> c) & 1;
        if (v === 1 && colOnes[c] + 1 > N / 2) ok = false;
        if (r >= 2 && ((rows[r - 1] >> c) & 1) === v && ((rows[r - 2] >> c) & 1) === v) ok = false;
        // zéros déjà posés : r - colOnes[c], plus ce zéro éventuel
        if (v === 0 && r - colOnes[c] + 1 > N / 2) ok = false;
      }
      if (!ok) continue;
      for (let c = 0; c < N; c++) colOnes[c] += (p >> c) & 1;
      rows.push(p);
      if (rec(r + 1)) return true;
      rows.pop();
      for (let c = 0; c < N; c++) colOnes[c] -= (p >> c) & 1;
    }
    return false;
  };
  if (!rec(0)) return null;
  const g = new Int8Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g[r * N + c] = (rows[r] >> c) & 1;
  if (broken(g, N)) return null; // colonnes en double
  return g;
}
