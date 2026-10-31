// Nonogram : indices, solveur par lignes et moteur de techniques.
// Case : 0 inconnue, 1 noire, 2 croix (vide). Une ligne est un masque de bits (bit i = case i noire).

export const runsOf = (bits, n) => {
  const out = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    if ((bits >> i) & 1) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out;
};

/** grid : tableau de N*N (0/1). Renvoie { rows, cols } (listes d'indices ; [] = ligne vide). */
export function cluesOf(grid, N) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < N; r++) {
    let m = 0;
    for (let c = 0; c < N; c++) if (grid[r * N + c]) m |= 1 << c;
    rows.push(runsOf(m, N));
  }
  for (let c = 0; c < N; c++) {
    let m = 0;
    for (let r = 0; r < N; r++) if (grid[r * N + c]) m |= 1 << r;
    cols.push(runsOf(m, N));
  }
  return { rows, cols };
}

const ARR = new Map();
/** Toutes les façons de placer l'indice dans une ligne de n cases (masques). */
export function arrangements(clue, n) {
  const key = clue.join(',') + '/' + n;
  let a = ARR.get(key);
  if (a) return a;
  a = [];
  const rec = (j, pos, mask) => {
    if (j === clue.length) { a.push(mask); return; }
    let rest = 0;
    for (let k = j + 1; k < clue.length; k++) rest += clue[k] + 1;
    for (let s = pos; s + clue[j] + rest <= n; s++) {
      rec(j + 1, s + clue[j] + 1, mask | (((1 << clue[j]) - 1) << s));
    }
  };
  rec(0, 0, 0);
  ARR.set(key, a);
  return a;
}

const popcnt = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };

/** Déduction complète d'une ligne. f : cases noires connues, e : cases vides connues. null si impossible. */
export function solveLine(clue, n, f, e) {
  const full = (1 << n) - 1;
  let and = full;
  let or = 0;
  let any = false;
  for (const m of arrangements(clue, n)) {
    if ((m & e) || (f & ~m)) continue;
    and &= m;
    or |= m;
    any = true;
  }
  return any ? { f: and, e: full & ~or } : null;
}

/** Déductions de base d'une ligne, sans regarder les croix : recouvrement des blocs, ligne pleine, ligne finie, bords. */
export function basicLine(clue, n, f, e) {
  const full = (1 << n) - 1;
  if (!clue.length) return { f: 0, e: full & ~e };
  const sum = clue.reduce((a, b) => a + b, 0);
  const slack = n - (sum + clue.length - 1);
  let addF = 0;
  let addE = 0;
  let start = 0;
  for (const len of clue) {
    if (len > slack) addF |= ((1 << (len - slack)) - 1) << (start + slack);
    start += len + 1;
  }
  if (slack === 0) addE |= full & ~addF;
  if (popcnt(f) === sum) addE |= full & ~f;
  if (f & 1) {
    addF |= (1 << clue[0]) - 1;
    if (clue[0] < n) addE |= 1 << clue[0];
  }
  if ((f >> (n - 1)) & 1) {
    const Ls = clue[clue.length - 1];
    addF |= ((1 << Ls) - 1) << (n - Ls);
    if (n - Ls - 1 >= 0) addE |= 1 << (n - Ls - 1);
  }
  return { f: addF & ~f & ~e, e: addE & ~e & ~f };
}

/**
 * Déductions par bornes d'une ligne : bornes gauche et droite de chaque bloc (en évitant les croix connues),
 * recouvrement, cases hors de toute borne, ligne finie, bords. Renvoie { f, e } nouvelles cases, ou null si impossible.
 */
export function simpleLine(clue, n, f, e) {
  const full = (1 << n) - 1;
  if (!clue.length) return { f: 0, e: full & ~e };
  const sum = clue.reduce((a, b) => a + b, 0);
  const blockMask = (s, len) => ((1 << len) - 1) << s;
  // positions les plus à gauche
  const L = [];
  let pos = 0;
  for (const len of clue) {
    let s = pos;
    while (s + len <= n && (blockMask(s, len) & e)) s++;
    if (s + len > n) return null;
    L.push(s);
    pos = s + len + 1;
  }
  // positions les plus à droite
  const R = new Array(clue.length);
  pos = n;
  for (let j = clue.length - 1; j >= 0; j--) {
    const len = clue[j];
    let s = pos - len;
    while (s >= 0 && (blockMask(s, len) & e)) s--;
    if (s < 0) return null;
    R[j] = s;
    pos = s - 1;
  }
  let addF = 0;
  let reach = 0;
  clue.forEach((len, j) => {
    if (R[j] < L[j]) return;
    if (R[j] <= L[j] + len - 1) addF |= ((1 << (L[j] + len - R[j])) - 1) << R[j];
    reach |= blockMask(L[j], R[j] - L[j] + len);
  });
  let addE = full & ~reach;
  if (popcnt(f) === sum) addE |= full & ~f;
  // bords : une case noire au bord commence ou termine le premier ou le dernier bloc
  if (f & 1) {
    addF |= (1 << clue[0]) - 1;
    if (clue[0] < n) addE |= 1 << clue[0];
  }
  if ((f >> (n - 1)) & 1) {
    const Ls = clue[clue.length - 1];
    addF |= ((1 << Ls) - 1) << (n - Ls);
    if (n - Ls - 1 >= 0) addE |= 1 << (n - Ls - 1);
  }
  return { f: addF & ~f & ~e, e: addE & ~e & ~f };
}

function lineMasks(cells, N, isRow, k) {
  let f = 0;
  let e = 0;
  for (let i = 0; i < N; i++) {
    const v = cells[isRow ? k * N + i : i * N + k];
    if (v === 1) f |= 1 << i;
    else if (v === 2) e |= 1 << i;
  }
  return { f, e };
}

function applyMasks(cells, N, isRow, k, addF, addE) {
  const changed = [];
  for (let i = 0; i < N; i++) {
    const idx = isRow ? k * N + i : i * N + k;
    if (cells[idx]) continue;
    if ((addF >> i) & 1) { cells[idx] = 1; changed.push(idx); }
    else if ((addE >> i) & 1) { cells[idx] = 2; changed.push(idx); }
  }
  return changed;
}

/** Propagation par lignes complètes jusqu'à stabilité. Renvoie false en cas de contradiction. */
function fixpoint(cells, N, rows, cols) {
  let moved = true;
  while (moved) {
    moved = false;
    for (let pass = 0; pass < 2; pass++) {
      const isRow = pass === 0;
      const clues = isRow ? rows : cols;
      for (let k = 0; k < N; k++) {
        const { f, e } = lineMasks(cells, N, isRow, k);
        const r = solveLine(clues[k], N, f, e);
        if (!r) return false;
        if (r.f & ~f || r.e & ~e) {
          applyMasks(cells, N, isRow, k, r.f, r.e);
          moved = true;
        }
      }
    }
  }
  return true;
}

/** Nombre de solutions (plafonné), par recherche avec propagation. */
export function countSolutions(rows, cols, N, limit = 2) {
  let count = 0;
  const rec = (cells) => {
    if (!fixpoint(cells, N, rows, cols)) return false;
    const i = cells.indexOf(0);
    if (i < 0) { count++; return count >= limit; }
    for (const v of [1, 2]) {
      const c = cells.slice();
      c[i] = v;
      if (rec(c)) return true;
    }
    return false;
  };
  rec(new Uint8Array(N * N));
  return count;
}

/** Une solution différente de `not` (tableau 0/1), ou null. */
export function solveAlt(rows, cols, N, not) {
  let found = null;
  const rec = (cells) => {
    if (!fixpoint(cells, N, rows, cols)) return false;
    const i = cells.indexOf(0);
    if (i < 0) {
      const g = Array.from(cells, (v) => (v === 1 ? 1 : 0));
      if (g.some((v, k) => v !== not[k])) { found = g; return true; }
      return false;
    }
    for (const v of [1, 2]) {
      const c = cells.slice();
      c[i] = v;
      if (rec(c)) return true;
    }
    return false;
  };
  rec(new Uint8Array(N * N));
  return found;
}

// ---------------------------------------------------------------------------
// Moteur de techniques : 1 base (recouvrement), 2 bornes (avec les croix), 3 ligne complète, 4 essai (hypothèse puis contradiction)

export function newState(N) {
  return { N, cells: new Uint8Array(N * N) };
}

/** Prochaine déduction : { tech, level, isRow, k, cells: [idx, ...], values: [1|2, ...] } ou null. */
export function findStep(cells, N, rows, cols, maxLevel = 4) {
  for (const [level, fn] of [[1, basicLine], [2, simpleLine], [3, solveLine]]) {
    if (level > maxLevel) break;
    for (let pass = 0; pass < 2; pass++) {
      const isRow = pass === 0;
      const clues = isRow ? rows : cols;
      for (let k = 0; k < N; k++) {
        const { f, e } = lineMasks(cells, N, isRow, k);
        const r = fn(clues[k], N, f, e);
        if (!r) continue;
        const nf = r.f & ~f;
        const ne = r.e & ~e;
        if (!nf && !ne) continue;
        const idxs = [];
        const vals = [];
        for (let i = 0; i < N; i++) {
          const idx = isRow ? k * N + i : i * N + k;
          if ((nf >> i) & 1) { idxs.push(idx); vals.push(1); }
          else if ((ne >> i) & 1) { idxs.push(idx); vals.push(2); }
        }
        if (idxs.length) return { tech: level === 1 ? 'basic' : level === 2 ? 'bounds' : 'line', level, isRow, k, cells: idxs, values: vals };
      }
    }
  }
  if (maxLevel >= 4) {
    for (let i = 0; i < N * N; i++) {
      if (cells[i]) continue;
      for (const v of [1, 2]) {
        const t = cells.slice();
        t[i] = v;
        if (!fixpoint(t, N, rows, cols)) return { tech: 'trial', level: 4, isRow: null, k: -1, cells: [i], values: [v === 1 ? 2 : 1] };
      }
    }
  }
  return null;
}

/** Toutes les déductions de ligne disponibles au niveau de technique le plus simple (indices). */
export function allSteps(cells, N, rows, cols, maxLevel = 4) {
  const out = [];
  for (const [level, fn] of [[1, basicLine], [2, simpleLine], [3, solveLine]]) {
    if (level > maxLevel) break;
    for (let pass = 0; pass < 2; pass++) {
      const isRow = pass === 0;
      const clues = isRow ? rows : cols;
      for (let k = 0; k < N; k++) {
        const { f, e } = lineMasks(cells, N, isRow, k);
        const r = fn(clues[k], N, f, e);
        if (!r) continue;
        const nf = r.f & ~f;
        const ne = r.e & ~e;
        if (!nf && !ne) continue;
        const idxs = [];
        const vals = [];
        for (let i = 0; i < N; i++) {
          const idx = isRow ? k * N + i : i * N + k;
          if ((nf >> i) & 1) { idxs.push(idx); vals.push(1); }
          else if ((ne >> i) & 1) { idxs.push(idx); vals.push(2); }
        }
        if (idxs.length) out.push({ tech: level === 1 ? 'basic' : level === 2 ? 'bounds' : 'line', level, isRow, k, cells: idxs, values: vals });
      }
    }
    if (out.length) return out;
  }
  if (maxLevel >= 4) {
    for (let i = 0; i < N * N && out.length < 4; i++) {
      if (cells[i]) continue;
      for (const v of [1, 2]) {
        const t = cells.slice();
        t[i] = v;
        if (!fixpoint(t, N, rows, cols)) { out.push({ tech: 'trial', level: 4, isRow: null, k: -1, cells: [i], values: [v === 1 ? 2 : 1] }); break; }
      }
    }
  }
  return out;
}

/** Résout avec les techniques. Renvoie { solved, rating, counts, cells }. */
export function solveWithTechniques(rows, cols, N, { maxLevel = 4, cells = null } = {}) {
  const st = cells ? Uint8Array.from(cells) : new Uint8Array(N * N);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 5000; guard++) {
    if (!st.includes(0)) break;
    const s = findStep(st, N, rows, cols, maxLevel);
    if (!s) return { solved: false, rating, counts, cells: st };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    s.cells.forEach((idx, j) => (st[idx] = s.values[j]));
  }
  return { solved: !st.includes(0), rating, counts, cells: st };
}
