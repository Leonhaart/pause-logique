// Star Battle (1 étoile) : solveur d'unicité et moteur de techniques.
// Règles : 1 étoile par ligne, par colonne et par région ; deux étoiles ne se touchent jamais (diagonale comprise).
//
// Unités : 0..N-1 lignes, N..2N-1 colonnes, 2N..3N-1 régions.
// États de case (cs) : 0 éliminée, 1 candidate, 2 étoile.

const GEO = new Map();
export function geo(N) {
  let g = GEO.get(N);
  if (g) return g;
  const NN = N * N;
  const row = new Int8Array(NN);
  const col = new Int8Array(NN);
  const neigh = [];
  for (let i = 0; i < NN; i++) {
    row[i] = (i / N) | 0;
    col[i] = i % N;
  }
  for (let i = 0; i < NN; i++) {
    const a = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const r = row[i] + dr;
        const c = col[i] + dc;
        if (r >= 0 && r < N && c >= 0 && c < N) a.push(r * N + c);
      }
    }
    neigh.push(a);
  }
  g = { N, NN, row, col, neigh };
  GEO.set(N, g);
  return g;
}

export const parseReg = (s) => Int8Array.from(s, (ch) => parseInt(ch, 36));
export const formatReg = (reg) => Array.from(reg, (v) => v.toString(36)).join('');
export const parseSol = (s) => Array.from(s, (ch) => parseInt(ch, 36)); // colonne de l'étoile par ligne
export const formatSol = (sol) => sol.map((v) => v.toString(36)).join('');


/** Dernière ligne contenant une case de chaque région (pour élaguer la recherche). */
function lastRows(reg, N) {
  const last = new Int8Array(N).fill(-1);
  for (let i = 0; i < reg.length; i++) last[reg[i]] = Math.max(last[reg[i]], (i / N) | 0);
  return last;
}
const starved = (last, regMask, r, N) => {
  for (let g = 0; g < N; g++) if (!((regMask >> g) & 1) && last[g] < r) return true;
  return false;
};

/** Nombre de solutions (plafonné à `limit`). `reg` : région de chaque case. */
export function countSolutions(reg, N, limit = 2) {
  let count = 0;
  let colMask = 0;
  let regMask = 0;
  const last = lastRows(reg, N);
  const rec = (r, prevCol) => {
    if (r < N && starved(last, regMask, r, N)) return false;
    if (r === N) {
      count++;
      return count >= limit;
    }
    for (let c = 0; c < N; c++) {
      if ((colMask >> c) & 1 || Math.abs(c - prevCol) <= 1) continue;
      const g = reg[r * N + c];
      if ((regMask >> g) & 1) continue;
      colMask |= 1 << c;
      regMask |= 1 << g;
      const stop = rec(r + 1, c);
      colMask &= ~(1 << c);
      regMask &= ~(1 << g);
      if (stop) return true;
    }
    return false;
  };
  rec(0, -9);
  return count;
}

/** Une solution différente de `not` (tableau de colonnes) ou null. */
export function solveAlt(reg, N, not) {
  const sol = new Array(N).fill(-1);
  let colMask = 0;
  let regMask = 0;
  const last = lastRows(reg, N);
  const rec = (r, prevCol) => {
    if (r < N && starved(last, regMask, r, N)) return false;
    if (r === N) return sol.some((c, i) => c !== not[i]);
    for (let c = 0; c < N; c++) {
      if ((colMask >> c) & 1 || Math.abs(c - prevCol) <= 1) continue;
      const g = reg[r * N + c];
      if ((regMask >> g) & 1) continue;
      colMask |= 1 << c;
      regMask |= 1 << g;
      sol[r] = c;
      if (rec(r + 1, c)) return true;
      colMask &= ~(1 << c);
      regMask &= ~(1 << g);
    }
    return false;
  };
  return rec(0, -9) ? sol : null;
}

/** Première solution (tableau de colonnes) ou null. */
export function solveOne(reg, N) {
  const sol = new Array(N).fill(-1);
  let colMask = 0;
  let regMask = 0;
  const last = lastRows(reg, N);
  const rec = (r, prevCol) => {
    if (r < N && starved(last, regMask, r, N)) return false;
    if (r === N) return true;
    for (let c = 0; c < N; c++) {
      if ((colMask >> c) & 1 || Math.abs(c - prevCol) <= 1) continue;
      const g = reg[r * N + c];
      if ((regMask >> g) & 1) continue;
      colMask |= 1 << c;
      regMask |= 1 << g;
      sol[r] = c;
      if (rec(r + 1, c)) return true;
      colMask &= ~(1 << c);
      regMask &= ~(1 << g);
    }
    return false;
  };
  return rec(0, -9) ? sol : null;
}

// ---------------------------------------------------------------------------
// Moteur de techniques

export function newState(reg, N) {
  const { NN, row, col } = geo(N);
  const unitCells = Array.from({ length: 3 * N }, () => []);
  for (let i = 0; i < NN; i++) {
    unitCells[row[i]].push(i);
    unitCells[N + col[i]].push(i);
    unitCells[2 * N + reg[i]].push(i);
  }
  return { N, reg, unitCells, cs: new Uint8Array(NN).fill(1), sat: new Uint8Array(3 * N), stars: 0 };
}

export function cloneState(st) {
  return { ...st, cs: st.cs.slice(), sat: st.sat.slice() };
}

export const unitsOf = (st, i) => {
  const { N } = st;
  const { row, col } = geo(N);
  return [row[i], N + col[i], 2 * N + st.reg[i]];
};

export function place(st, i) {
  const { neigh } = geo(st.N);
  st.cs[i] = 2;
  st.stars++;
  for (const u of unitsOf(st, i)) {
    st.sat[u] = 1;
    for (const c of st.unitCells[u]) if (c !== i && st.cs[c] === 1) st.cs[c] = 0;
  }
  for (const nb of neigh[i]) if (st.cs[nb] === 1) st.cs[nb] = 0;
}

/** Une unité non satisfaite n'a plus de candidate : impasse. */
export function dead(st) {
  for (let u = 0; u < st.sat.length; u++) {
    if (st.sat[u]) continue;
    let any = false;
    for (const c of st.unitCells[u]) if (st.cs[c] === 1) { any = true; break; }
    if (!any) return true;
  }
  return false;
}

const TECH_LEVEL = { single: 1, set1: 1, set2: 2, trial1: 3, set3: 4, trial2: 5, set4: 5 };
export const techLevel = (tech) => TECH_LEVEL[tech] ?? 5;

function stepSingle(st) {
  for (let u = 0; u < st.sat.length; u++) {
    if (st.sat[u]) continue;
    let n = 0;
    let last = -1;
    for (const c of st.unitCells[u]) if (st.cs[c] === 1) { n++; last = c; }
    if (n === 1) return { tech: 'single', level: 1, place: last, units: [u] };
  }
  return null;
}

// Types d'unités : 0 ligne, 1 colonne, 2 région.
const PAIRS = [[2, 0], [2, 1], [0, 2], [1, 2], [0, 1], [1, 0]];

/**
 * k unités de type A dont toutes les candidates tiennent dans k unités de type B :
 * ces k unités B contiennent exactement ces k étoiles, on élimine le reste des unités B.
 */
function stepSets(st, k) {
  const { N } = st;
  const { row, col } = geo(N);
  const typeOf = [
    (c) => row[c],
    (c) => col[c],
    (c) => st.reg[c],
  ];
  for (const [A, B] of PAIRS) {
    const list = [];
    for (let a = 0; a < N; a++) {
      const u = A * N + a;
      if (st.sat[u]) continue;
      let mask = 0;
      for (const c of st.unitCells[u]) if (st.cs[c] === 1) mask |= 1 << typeOf[B](c);
      list.push({ a, mask });
    }
    const pop = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
    const chosen = [];
    let found = null;
    const rec = (start, union) => {
      if (found) return;
      if (chosen.length === k) {
        if (pop(union) !== k) return;
        const chosenA = new Set(chosen.map((x) => x.a));
        const elim = [];
        for (let b = 0; b < N; b++) {
          if (!((union >> b) & 1)) continue;
          for (const c of st.unitCells[B * N + b]) {
            if (st.cs[c] === 1 && !chosenA.has(typeOf[A](c))) elim.push(c);
          }
        }
        if (elim.length) {
          found = {
            tech: `set${k}`,
            level: techLevel(`set${k}`),
            elim,
            units: [...chosen.map((x) => A * N + x.a)],
            targets: [...Array(N).keys()].filter((b) => (union >> b) & 1).map((b) => B * N + b),
          };
        }
        return;
      }
      for (let i = start; i < list.length; i++) {
        const nu = union | list[i].mask;
        if (pop(nu) > k) continue;
        chosen.push(list[i]);
        rec(i + 1, nu);
        chosen.pop();
        if (found) return;
      }
    };
    rec(0, 0);
    if (found) return found;
  }
  return null;
}

function applyStep(st, s) {
  if (s.place != null) place(st, s.place);
  else for (const c of s.elim) if (st.cs[c] === 1) st.cs[c] = 0;
}

/** Propage avec les techniques de niveau ≤ maxLevel ; renvoie true si impasse. */
function propagate(st, maxLevel) {
  for (let guard = 0; guard < 500; guard++) {
    if (dead(st)) return true;
    if (st.stars === st.N) return false;
    const s = findStep(st, maxLevel, false);
    if (!s) return false;
    applyStep(st, s);
  }
  return false;
}

function stepTrial(st, propLevel) {
  const NN = st.N * st.N;
  for (let x = 0; x < NN; x++) {
    if (st.cs[x] !== 1) continue;
    const t = cloneState(st);
    place(t, x);
    if (propagate(t, propLevel)) {
      return { tech: `trial${propLevel}`, level: techLevel(`trial${propLevel}`), elim: [x], units: unitsOf(st, x) };
    }
  }
  return null;
}

/** Prochaine déduction de niveau ≤ maxLevel, la plus simple d'abord. */
export function findStep(st, maxLevel = 5, allowTrial = true) {
  let s = stepSingle(st);
  if (s) return s;
  s = stepSets(st, 1);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepSets(st, 2))) return s;
  if (maxLevel >= 3 && allowTrial && (s = stepTrial(st, 1))) return s;
  if (maxLevel >= 4 && (s = stepSets(st, 3))) return s;
  if (maxLevel >= 5) {
    if (allowTrial && (s = stepTrial(st, 2))) return s;
    if ((s = stepSets(st, 4))) return s;
  }
  return null;
}

/** Résout avec les techniques ; renvoie { solved, rating, counts }. */
export function solveWithTechniques(reg, N, { maxLevel = 5 } = {}) {
  const st = newState(reg, N);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 2000 && st.stars < N; guard++) {
    const s = findStep(st, maxLevel);
    if (!s) return { solved: false, rating, counts };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    applyStep(st, s);
  }
  return { solved: st.stars === N, rating, counts };
}
