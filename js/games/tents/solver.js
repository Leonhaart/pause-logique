// Tents : une tente à côté (haut, bas, gauche, droite) de chaque arbre, une par arbre ;
// deux tentes ne se touchent jamais, diagonale comprise ; les chiffres donnent les tentes par ligne et colonne.
//
// Grille : Int8Array. -1 inconnue, 0 herbe, 1 tente, 2 arbre (fixe).
// Chaîne d'une grille : N*N caractères (. vide, T arbre), puis N chiffres (lignes), puis N chiffres (colonnes).
// Techniques (niveau) : basic 1 (comptes, voisinage), single 2 (arbre à un seul choix),
// avoid 3 (case touchant tous les choix d'un arbre), line 4 (toutes les façons de remplir une ligne), trial 5.

const CACHE = new Map();
export function geo(N) {
  let g = CACHE.get(N);
  if (g) return g;
  const NN = N * N;
  const n4 = [];
  const n8 = [];
  for (let i = 0; i < NN; i++) {
    const r = Math.floor(i / N);
    const c = i % N;
    const a = [];
    const b = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        b.push(rr * N + cc);
        if (!dr || !dc) a.push(rr * N + cc);
      }
    }
    n4.push(a);
    n8.push(b);
  }
  const lines = [];
  for (let r = 0; r < N; r++) lines.push(Array.from({ length: N }, (_, c) => r * N + c));
  for (let c = 0; c < N; c++) lines.push(Array.from({ length: N }, (_, r) => r * N + c));
  g = { N, NN, n4, n8, lines };
  CACHE.set(N, g);
  return g;
}

export function parsePuz(s, N) {
  const NN = N * N;
  const tree = Uint8Array.from(s.slice(0, NN), (ch) => (ch === 'T' ? 1 : 0));
  const counts = Array.from(s.slice(NN, NN + 2 * N), (ch) => +ch);
  return { N, tree, rows: counts.slice(0, N), cols: counts.slice(N) };
}
export const formatPuz = (p) =>
  Array.from(p.tree, (v) => (v ? 'T' : '.')).join('') + p.rows.join('') + p.cols.join('');

export function newState(p) {
  const st = { N: p.N, p, cs: new Int8Array(p.N * p.N).fill(-1) };
  p.tree.forEach((v, i) => { if (v) st.cs[i] = 2; });
  return st;
}
const cloneState = (st) => ({ ...st, cs: st.cs.slice() });

const lineTarget = (p, u) => (u < p.N ? p.rows[u] : p.cols[u - p.N]);

/** Une règle est déjà violée. */
export function broken(st) {
  const { N, p, cs } = st;
  const { n4, n8, lines } = geo(N);
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] === 1) for (const j of n8[i]) if (cs[j] === 1) return true;
  }
  for (let u = 0; u < lines.length; u++) {
    let tents = 0;
    let unk = 0;
    for (const i of lines[u]) { if (cs[i] === 1) tents++; else if (cs[i] === -1) unk++; }
    const t = lineTarget(p, u);
    if (tents > t || tents + unk < t) return true;
  }
  // un arbre sans tente possible ; une tente sans arbre voisin
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] === 2 && !n4[i].some((j) => cs[j] === -1 || cs[j] === 1)) return true;
    if (cs[i] === 1 && !n4[i].some((j) => cs[j] === 2)) return true;
  }
  return false;
}

/** Chaque tente peut-elle être rattachée à un arbre voisin, un pour un ? (couplage) */
export function matches(cs, N) {
  const { n4 } = geo(N);
  const tents = [];
  const trees = [];
  cs.forEach((v, i) => { if (v === 1) tents.push(i); else if (v === 2) trees.push(i); });
  if (tents.length !== trees.length) return false;
  const owner = new Map();
  const tryTent = (t, seen) => {
    for (const tr of n4[t]) {
      if (cs[tr] !== 2 || seen.has(tr)) continue;
      seen.add(tr);
      if (!owner.has(tr) || tryTent(owner.get(tr), seen)) { owner.set(tr, t); return true; }
    }
    return false;
  };
  return tents.every((t) => tryTent(t, new Set()));
}

/** La grille complète est-elle une solution ? */
export function isSolution(cs, p) {
  const { N, lines, n8 } = geo(p.N);
  if (cs.includes(-1)) return false;
  for (let i = 0; i < cs.length; i++) if (cs[i] === 1) for (const j of n8[i]) if (cs[j] === 1) return false;
  for (let u = 0; u < lines.length; u++) {
    let tents = 0;
    for (const i of lines[u]) if (cs[i] === 1) tents++;
    if (tents !== lineTarget(p, u)) return false;
  }
  return matches(cs, N);
}

const apply = (st, s) => { for (const [i, v] of s.cells) st.cs[i] = v; };

function stepBasic(st) {
  const { N, p, cs } = st;
  const { n4, n8, lines } = geo(N);
  // tente posée : voisines en herbe
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] !== 1) continue;
    const out = n8[i].filter((j) => cs[j] === -1).map((j) => [j, 0]);
    if (out.length) return { tech: 'around', level: 1, cells: out, units: [], focus: [i] };
  }
  // case sans arbre voisin : herbe
  const bare = [];
  for (let i = 0; i < cs.length; i++) if (cs[i] === -1 && !n4[i].some((j) => cs[j] === 2)) bare.push([i, 0]);
  if (bare.length) return { tech: 'notree', level: 1, cells: bare, units: [], focus: bare.map(([i]) => i) };
  // comptes : ligne complète ou ligne qui doit être pleine
  for (let u = 0; u < lines.length; u++) {
    let tents = 0;
    const unk = [];
    for (const i of lines[u]) { if (cs[i] === 1) tents++; else if (cs[i] === -1) unk.push(i); }
    if (!unk.length) continue;
    const need = lineTarget(p, u) - tents;
    if (need === 0) return { tech: 'zero', level: 1, cells: unk.map((i) => [i, 0]), units: [u] };
    if (need === unk.length) return { tech: 'full', level: 1, cells: unk.map((i) => [i, 1]), units: [u] };
  }
  return null;
}

/** Voisines (haut, bas, gauche, droite) encore possibles pour la tente d'un arbre. */
const options = (st, tr) => geo(st.N).n4[tr].filter((j) => st.cs[j] !== 0 && st.cs[j] !== 2);

function stepSingle(st) {
  const { cs } = st;
  for (let tr = 0; tr < cs.length; tr++) {
    if (cs[tr] !== 2) continue;
    const opts = options(st, tr);
    const placed = opts.filter((j) => cs[j] === 1);
    if (!placed.length && opts.length === 1 && cs[opts[0]] === -1) {
      return { tech: 'single', level: 2, cells: [[opts[0], 1]], units: [], focus: [tr, opts[0]] };
    }
  }
  return null;
}

function stepAvoid(st) {
  const { N, cs } = st;
  const { n8 } = geo(N);
  for (let tr = 0; tr < cs.length; tr++) {
    if (cs[tr] !== 2) continue;
    const opts = options(st, tr);
    if (opts.length < 2 || opts.some((j) => cs[j] === 1)) continue;
    const out = [];
    for (let x = 0; x < cs.length; x++) {
      if (cs[x] !== -1 || opts.includes(x)) continue;
      if (opts.every((j) => n8[j].includes(x))) out.push([x, 0]);
    }
    if (out.length) return { tech: 'avoid', level: 3, cells: out, units: [], focus: [tr, ...opts] };
  }
  return null;
}

/** Toutes les façons de remplir une ligne (comptes, pas de tentes voisines dans la ligne). */
function stepLine(st) {
  const { N, p, cs } = st;
  const { lines } = geo(N);
  for (let u = 0; u < lines.length; u++) {
    const line = lines[u];
    const unk = [];
    let tents = 0;
    line.forEach((i, k) => { if (cs[i] === -1) unk.push(k); else if (cs[i] === 1) tents++; });
    if (!unk.length) continue;
    const need = lineTarget(p, u) - tents;
    const hits = new Array(unk.length).fill(0);
    let total = 0;
    const chosen = [];
    const rec = (idx, left) => {
      if (left === 0) {
        total++;
        for (const c of chosen) hits[c]++;
        return;
      }
      if (idx === unk.length || unk.length - idx < left) return;
      // prendre unk[idx] si aucun voisin de ligne n'est déjà une tente
      const k = unk[idx];
      const nb = [k - 1, k + 1].filter((x) => x >= 0 && x < N).map((x) => line[x]);
      const okTake = !nb.some((j) => cs[j] === 1) && !(chosen.length && unk[chosen[chosen.length - 1]] === k - 1);
      if (okTake) { chosen.push(idx); rec(idx + 1, left - 1); chosen.pop(); }
      rec(idx + 1, left);
    };
    rec(0, need);
    if (!total) return { contra: true };
    const out = [];
    unk.forEach((k, idx) => {
      if (hits[idx] === total) out.push([line[k], 1]);
      else if (hits[idx] === 0) out.push([line[k], 0]);
    });
    if (out.length) return { tech: 'line', level: 4, cells: out, units: [u] };
  }
  return null;
}

function propagate(st, maxLevel) {
  for (let guard = 0; guard < 600; guard++) {
    if (broken(st)) return true;
    if (!st.cs.includes(-1)) return false;
    const s = findStep(st, maxLevel, false);
    if (!s) return false;
    if (s.contra) return true;
    apply(st, s);
  }
  return false;
}

function stepTrial(st) {
  for (let i = 0; i < st.cs.length; i++) {
    if (st.cs[i] !== -1) continue;
    for (const v of [1, 0]) {
      const t = cloneState(st);
      t.cs[i] = v;
      if (propagate(t, 4)) return { tech: 'trial', level: 5, cells: [[i, 1 - v]], units: [], focus: [i] };
    }
  }
  return null;
}

/** Prochaine déduction de niveau <= maxLevel, la plus simple d'abord. */
export function findStep(st, maxLevel = 5, allowTrial = true) {
  let s = stepBasic(st);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepSingle(st))) return s;
  if (maxLevel >= 3 && (s = stepAvoid(st))) return s;
  if (maxLevel >= 4 && (s = stepLine(st))) return s;
  if (maxLevel >= 5 && allowTrial && (s = stepTrial(st))) return s;
  return null;
}

/** Résout avec les techniques ; renvoie { solved, rating, counts, grid }. */
export function solveWithTechniques(p, { maxLevel = 5 } = {}) {
  const st = newState(p);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 800; guard++) {
    if (broken(st)) return { solved: false, rating, counts, grid: st.cs };
    if (!st.cs.includes(-1)) return { solved: isSolution(st.cs, p), rating, counts, grid: st.cs };
    const s = findStep(st, maxLevel);
    if (!s || s.contra) return { solved: false, rating, counts, grid: st.cs };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    apply(st, s);
  }
  return { solved: false, rating, counts, grid: st.cs };
}

/** Nombre de solutions (plafonné) et première solution. */
export function countSolutions(p, limit = 2) {
  let count = 0;
  let first = null;
  const all = [];
  const rec = (st) => {
    if (propagate(st, 4)) return false;
    const i = st.cs.indexOf(-1);
    if (i < 0) {
      if (!isSolution(st.cs, p)) return false;
      count++;
      all.push(st.cs.slice());
      if (!first) first = st.cs.slice();
      return count >= limit;
    }
    for (const v of [1, 0]) {
      const t = cloneState(st);
      t.cs[i] = v;
      if (rec(t)) return true;
    }
    return false;
  };
  rec(newState(p));
  return { count, sol: first, all };
}

/** Une configuration aléatoire (arbres + comptes + solution), ou null. rng : { int, shuffle }. */
export function randomConfig(N, trees, rng) {
  const { n4, n8 } = geo(N);
  const cs = new Int8Array(N * N); // 0 libre, 1 tente, 2 arbre
  const order = rng.shuffle([...Array(N * N).keys()]);
  let placed = 0;
  for (const t of order) {
    if (placed >= trees) break;
    if (cs[t] !== 0 || n8[t].some((j) => cs[j] === 1)) continue;
    const spots = rng.shuffle(n4[t].filter((j) => cs[j] === 0));
    if (!spots.length) continue;
    cs[t] = 1;
    cs[spots[0]] = 2;
    placed++;
  }
  if (placed < trees) return null;
  const tree = Uint8Array.from(cs, (v) => (v === 2 ? 1 : 0));
  const rows = Array(N).fill(0);
  const cols = Array(N).fill(0);
  cs.forEach((v, i) => { if (v === 1) { rows[Math.floor(i / N)]++; cols[i % N]++; } });
  if (rows.some((x) => x > 9) || cols.some((x) => x > 9)) return null;
  const sol = Int8Array.from(cs, (v) => (v === 1 ? 1 : v === 2 ? 2 : 0));
  return { puz: { N, tree, rows, cols }, sol };
}
