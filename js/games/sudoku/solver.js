// Solveur Sudoku : recherche exhaustive (unicité) + moteur de techniques « humaines » (notation, indices).
// Une grille est un Int8Array(81), 0 = vide. Les candidats sont des masques 9 bits (bit d-1 = chiffre d).

export const ALL = 0x1ff;
const bit = (d) => 1 << (d - 1);
const digitOf = (mask) => 32 - Math.clz32(mask); // masque à un seul bit -> chiffre
export const popcnt = (x) => {
  x -= (x >> 1) & 0x5555;
  x = (x & 0x3333) + ((x >> 2) & 0x3333);
  x = (x + (x >> 4)) & 0x0f0f;
  return (x + (x >> 8)) & 0x1f;
};

export const ROW = new Int8Array(81);
export const COL = new Int8Array(81);
export const BOX = new Int8Array(81);
for (let i = 0; i < 81; i++) {
  ROW[i] = Math.floor(i / 9);
  COL[i] = i % 9;
  BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
}

// UNITS : 0-8 lignes, 9-17 colonnes, 18-26 blocs
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + bc + c);
  UNITS.push(cells);
}
export const unitKind = (u) => (u < 9 ? 'row' : u < 18 ? 'col' : 'box');

export const PEERS = [];
const SEES = new Uint8Array(81 * 81);
for (let i = 0; i < 81; i++) {
  const set = new Set([...UNITS[ROW[i]], ...UNITS[9 + COL[i]], ...UNITS[18 + BOX[i]]]);
  set.delete(i);
  PEERS.push([...set]);
  for (const p of set) SEES[i * 81 + p] = 1;
}
export const sees = (a, b) => SEES[a * 81 + b] === 1;

export const parse = (str) => Int8Array.from(String(str), (ch) => (ch >= '1' && ch <= '9' ? +ch : 0));
export const format = (grid) => Array.from(grid, (d) => d || 0).join('');

/** Cases en conflit (même chiffre deux fois dans une ligne, colonne ou bloc). */
export function conflicts(grid) {
  const bad = new Set();
  for (const unit of UNITS) {
    const seen = new Map();
    for (const i of unit) {
      const d = grid[i];
      if (!d) continue;
      if (seen.has(d)) {
        bad.add(i);
        bad.add(seen.get(d));
      } else seen.set(d, i);
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Recherche exhaustive
// ---------------------------------------------------------------------------

/**
 * Parcourt les solutions. opts.limit : nombre max de solutions ; opts.rng : ordre aléatoire des essais ;
 * opts.onSolution(grid) appelé pour chaque solution. Retourne le nombre de solutions trouvées.
 */
export function search(grid, { limit = 2, rng = null, onSolution = null } = {}) {
  const g = Int8Array.from(grid);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) continue;
    const b = bit(d);
    if (rows[ROW[i]] & b || cols[COL[i]] & b || boxes[BOX[i]] & b) return 0;
    rows[ROW[i]] |= b;
    cols[COL[i]] |= b;
    boxes[BOX[i]] |= b;
  }
  let count = 0;
  const rec = () => {
    let best = -1;
    let bestMask = 0;
    let bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const n = popcnt(m);
      if (n === 0) return;
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n === 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (onSolution) onSolution(g);
      return;
    }
    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & bit(d)) digits.push(d);
    const order = rng ? rng.shuffle(digits) : digits;
    const r = ROW[best];
    const c = COL[best];
    const b = BOX[best];
    for (const d of order) {
      const m = bit(d);
      g[best] = d;
      rows[r] |= m;
      cols[c] |= m;
      boxes[b] |= m;
      rec();
      g[best] = 0;
      rows[r] &= ~m;
      cols[c] &= ~m;
      boxes[b] &= ~m;
      if (count >= limit) return;
    }
  };
  rec();
  return count;
}

export const countSolutions = (grid, limit = 2) => search(grid, { limit });

/** Première solution (ou null). */
export function solve(grid, rng = null) {
  let sol = null;
  search(grid, { limit: 1, rng, onSolution: (g) => (sol = Int8Array.from(g)) });
  return sol;
}

// ---------------------------------------------------------------------------
// Moteur de techniques
// ---------------------------------------------------------------------------

export function initState(grid) {
  const g = Int8Array.from(grid);
  const c = new Uint16Array(81).fill(ALL);
  for (let i = 0; i < 81; i++) {
    if (!g[i]) continue;
    c[i] = 0;
    const b = bit(g[i]);
    for (const p of PEERS[i]) c[p] &= ~b;
  }
  return { g, c };
}

export function applyStep(st, step) {
  if (step.place) {
    const { i, d } = step.place;
    st.g[i] = d;
    st.c[i] = 0;
    const b = bit(d);
    for (const p of PEERS[i]) st.c[p] &= ~b;
  }
  if (step.elim) for (const { i, mask } of step.elim) st.c[i] &= ~mask;
}

const elimFrom = (st, cells, mask) => {
  const out = [];
  for (const i of cells) if (st.g[i] === 0 && st.c[i] & mask) out.push({ i, mask: st.c[i] & mask });
  return out;
};

function nakedSingle(st) {
  for (let i = 0; i < 81; i++) {
    if (st.g[i] === 0 && popcnt(st.c[i]) === 1) {
      return { tech: 'nakedSingle', level: 1, place: { i, d: digitOf(st.c[i]) }, cells: [i] };
    }
  }
  return null;
}

function hiddenSingle(st) {
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let found = -1;
      let n = 0;
      for (const i of UNITS[u]) {
        if (st.g[i] === 0 && st.c[i] & b) {
          found = i;
          n++;
        }
      }
      if (n === 1) return { tech: 'hiddenSingle', level: 1, place: { i: found, d }, unit: u, cells: [found] };
    }
  }
  return null;
}

function lockedCandidates(st) {
  // Pointing : dans un bloc, un chiffre n'est possible que sur une ligne/colonne -> exclu du reste de la ligne/colonne.
  for (let k = 0; k < 9; k++) {
    const box = UNITS[18 + k];
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const cells = box.filter((i) => st.g[i] === 0 && st.c[i] & b);
      if (cells.length < 2) continue;
      const sameRow = cells.every((i) => ROW[i] === ROW[cells[0]]);
      const sameCol = cells.every((i) => COL[i] === COL[cells[0]]);
      for (const [ok, u] of [[sameRow, ROW[cells[0]]], [sameCol, 9 + COL[cells[0]]]]) {
        if (!ok) continue;
        const elim = elimFrom(st, UNITS[u].filter((i) => BOX[i] !== k), b);
        if (elim.length) return { tech: 'pointing', level: 2, elim, digit: d, unit: 18 + k, cells };
      }
    }
  }
  // Réduction bloc-ligne : dans une ligne/colonne, un chiffre n'est possible que dans un bloc -> exclu du reste du bloc.
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const cells = UNITS[u].filter((i) => st.g[i] === 0 && st.c[i] & b);
      if (cells.length < 2) continue;
      if (!cells.every((i) => BOX[i] === BOX[cells[0]])) continue;
      const elim = elimFrom(st, UNITS[18 + BOX[cells[0]]].filter((i) => !UNITS[u].includes(i)), b);
      if (elim.length) return { tech: 'claiming', level: 2, elim, digit: d, unit: u, cells };
    }
  }
  return null;
}

function combos(n, k) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === k) return out.push(cur.slice());
    for (let i = start; i < n; i++) {
      cur.push(i);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

function nakedSubset(st, k) {
  const tech = k === 2 ? 'nakedPair' : 'nakedTriple';
  for (let u = 0; u < 27; u++) {
    const cells = UNITS[u].filter((i) => st.g[i] === 0 && popcnt(st.c[i]) >= 2 && popcnt(st.c[i]) <= k);
    if (cells.length < k) continue;
    for (const idx of combos(cells.length, k)) {
      const set = idx.map((x) => cells[x]);
      const union = set.reduce((m, i) => m | st.c[i], 0);
      if (popcnt(union) !== k) continue;
      const elim = elimFrom(st, UNITS[u].filter((i) => !set.includes(i)), union);
      if (elim.length) return { tech, level: 2, elim, unit: u, cells: set, mask: union };
    }
  }
  return null;
}

function hiddenSubset(st, k) {
  const tech = k === 2 ? 'hiddenPair' : 'hiddenTriple';
  for (let u = 0; u < 27; u++) {
    const pos = [];
    for (let d = 1; d <= 9; d++) {
      let m = 0;
      UNITS[u].forEach((i, x) => {
        if (st.g[i] === 0 && st.c[i] & bit(d)) m |= 1 << x;
      });
      if (popcnt(m) >= 2 && popcnt(m) <= k) pos.push({ d, m });
    }
    if (pos.length < k) continue;
    for (const idx of combos(pos.length, k)) {
      const sel = idx.map((x) => pos[x]);
      const union = sel.reduce((m, p) => m | p.m, 0);
      if (popcnt(union) !== k) continue;
      const digitsMask = sel.reduce((m, p) => m | bit(p.d), 0);
      const cells = UNITS[u].filter((_, x) => union & (1 << x));
      const elim = [];
      for (const i of cells) if (st.c[i] & ~digitsMask) elim.push({ i, mask: st.c[i] & ~digitsMask });
      if (elim.length) return { tech, level: 2, elim, unit: u, cells, mask: digitsMask };
    }
  }
  return null;
}

function fish(st, size) {
  const tech = size === 2 ? 'xwing' : 'swordfish';
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    for (const byRows of [true, false]) {
      const lines = [];
      for (let a = 0; a < 9; a++) {
        let m = 0;
        for (let x = 0; x < 9; x++) {
          const i = byRows ? a * 9 + x : x * 9 + a;
          if (st.g[i] === 0 && st.c[i] & b) m |= 1 << x;
        }
        if (popcnt(m) >= 2 && popcnt(m) <= size) lines.push({ a, m });
      }
      if (lines.length < size) continue;
      for (const idx of combos(lines.length, size)) {
        const sel = idx.map((x) => lines[x]);
        const union = sel.reduce((m, l) => m | l.m, 0);
        if (popcnt(union) !== size) continue;
        const base = new Set(sel.map((l) => l.a));
        const elim = [];
        for (let x = 0; x < 9; x++) {
          if (!(union & (1 << x))) continue;
          for (let a = 0; a < 9; a++) {
            if (base.has(a)) continue;
            const i = byRows ? a * 9 + x : x * 9 + a;
            if (st.g[i] === 0 && st.c[i] & b) elim.push({ i, mask: b });
          }
        }
        if (elim.length) {
          const cells = [];
          for (const l of sel) for (let x = 0; x < 9; x++) if (l.m & (1 << x)) cells.push(byRows ? l.a * 9 + x : x * 9 + l.a);
          return { tech, level: 3, elim, digit: d, cells };
        }
      }
    }
  }
  return null;
}

function xyWing(st) {
  for (let p = 0; p < 81; p++) {
    if (st.g[p] !== 0 || popcnt(st.c[p]) !== 2) continue;
    const pm = st.c[p];
    const pincers = PEERS[p].filter((i) => st.g[i] === 0 && popcnt(st.c[i]) === 2 && popcnt(st.c[i] & pm) === 1);
    for (let x = 0; x < pincers.length; x++) {
      for (let y = x + 1; y < pincers.length; y++) {
        const a = pincers[x];
        const b = pincers[y];
        const common = st.c[a] & st.c[b];
        if (popcnt(common) !== 1 || common & pm) continue;
        if ((st.c[a] & pm) === (st.c[b] & pm)) continue;
        const elim = [];
        for (let i = 0; i < 81; i++) {
          if (i !== a && i !== b && i !== p && st.g[i] === 0 && st.c[i] & common && sees(i, a) && sees(i, b)) {
            elim.push({ i, mask: common });
          }
        }
        if (elim.length) return { tech: 'xyWing', level: 3, elim, cells: [p, a, b], digit: digitOf(common) };
      }
    }
  }
  return null;
}

const FINDERS = [
  nakedSingle,
  hiddenSingle,
  lockedCandidates,
  (s) => nakedSubset(s, 2),
  (s) => hiddenSubset(s, 2),
  (s) => nakedSubset(s, 3),
  (s) => hiddenSubset(s, 3),
  (s) => fish(s, 2),
  xyWing,
  (s) => fish(s, 3),
];

/** Prochaine étape logique (la technique la plus simple d'abord), ou null. */
export function findStep(st, maxLevel = 3) {
  for (const f of FINDERS) {
    const step = f(st);
    if (step && step.level <= maxLevel) return step;
  }
  return null;
}

const contradiction = (st) => {
  for (let i = 0; i < 81; i++) if (st.g[i] === 0 && st.c[i] === 0) return true;
  return false;
};

/**
 * Résout avec les techniques jusqu'au niveau maxLevel.
 * Retourne { solved, rating (0 si non résolu), used: {technique: n}, grid }.
 * opts.solution : si fourni, lève une erreur à la première étape incompatible (tests).
 */
export function solveWithTechniques(grid, { maxLevel = 3, solution = null } = {}) {
  const st = initState(grid);
  const used = {};
  let rating = 0;
  for (;;) {
    if (contradiction(st)) return { solved: false, rating: 0, used, grid: st.g, contradiction: true };
    if (st.g.every((d) => d)) return { solved: true, rating, used, grid: st.g };
    const step = findStep(st, maxLevel);
    if (!step) return { solved: false, rating: 0, used, grid: st.g };
    if (solution) {
      if (step.place && solution[step.place.i] !== step.place.d) throw new Error(`placement faux (${step.tech})`);
      for (const e of step.elim || []) if (e.mask & bit(solution[e.i])) throw new Error(`élimination fausse (${step.tech})`);
    }
    used[step.tech] = (used[step.tech] || 0) + 1;
    if (step.level > rating) rating = step.level;
    applyStep(st, step);
  }
}

/** Note la grille : 1 facile, 2 moyen, 3 difficile, 0 si les techniques ne suffisent pas. */
export const rate = (grid) => solveWithTechniques(grid).rating;

/**
 * Prochain chiffre à placer, pour l'indice : exécute les techniques jusqu'au premier placement.
 * Retourne { i, d, tech, unit, prior: [techniques d'élimination utilisées] } ou null si bloqué.
 */
export function nextPlacement(grid) {
  const st = initState(grid);
  const prior = [];
  for (let guard = 0; guard < 400; guard++) {
    const step = findStep(st, 3);
    if (!step) return null;
    if (step.place) return { ...step.place, tech: step.tech, unit: step.unit ?? null, prior };
    prior.push({ tech: step.tech, cells: step.cells, unit: step.unit ?? null, digit: step.digit ?? null });
    applyStep(st, step);
  }
  return null;
}

/** Candidats calculés depuis la grille (pour les notes automatiques). */
export const candidates = (grid) => initState(grid).c;
