// Futoshiki : carré latin N×N avec des signes < > entre cases voisines et quelques chiffres donnés.
//
// Grille : Int8Array de chiffres 1..N (0 = vide). Relations : liste [a, b] signifiant « case a < case b ».
// Chaîne d'une grille : N*N chiffres donnés ('.' ou 1..N), puis N*(N-1) signes horizontaux
// (entre (r,c) et (r,c+1)), puis (N-1)*N signes verticaux (entre (r,c) et (r+1,c)) : '.', '<' ou '>'.
//
// Techniques (niveau) : single 1 (chiffre forcé), bound 2 (bornes imposées par les signes),
// pair 3 (paires), triple 4 (triplets), trial 5 (essai logique).

const bit = (d) => 1 << (d - 1);
import { planHint, manhattan } from '../../core/hint.js';
const pop = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const lowBit = (m) => m & -m;
const bitLen = (m) => 32 - Math.clz32(m); // plus grand chiffre = bitLen(m)
const lowDigit = (m) => bitLen(lowBit(m));

const CACHE = new Map();
export function geo(N) {
  let g = CACHE.get(N);
  if (g) return g;
  const lines = [];
  for (let r = 0; r < N; r++) lines.push(Array.from({ length: N }, (_, c) => r * N + c));
  for (let c = 0; c < N; c++) lines.push(Array.from({ length: N }, (_, r) => r * N + c));
  g = { N, NN: N * N, lines, full: (1 << N) - 1 };
  CACHE.set(N, g);
  return g;
}

export function parsePuz(s, N) {
  const NN = N * N;
  const giv = Int8Array.from(s.slice(0, NN), (ch) => (ch === '.' ? 0 : +ch));
  const rel = [];
  const hs = s.slice(NN, NN + N * (N - 1));
  const vs = s.slice(NN + N * (N - 1));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N - 1; c++) {
      const ch = hs[r * (N - 1) + c];
      const a = r * N + c;
      if (ch === '<') rel.push([a, a + 1]);
      else if (ch === '>') rel.push([a + 1, a]);
    }
  }
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N; c++) {
      const ch = vs[r * N + c];
      const a = r * N + c;
      if (ch === '<') rel.push([a, a + N]);
      else if (ch === '>') rel.push([a + N, a]);
    }
  }
  return { N, giv, rel };
}

export function formatPuz({ N, giv, rel }) {
  const h = new Array(N * (N - 1)).fill('.');
  const v = new Array((N - 1) * N).fill('.');
  for (const [a, b] of rel) {
    if (b === a + 1 && a % N !== N - 1) h[Math.floor(a / N) * (N - 1) + (a % N)] = '<';
    else if (a === b + 1 && b % N !== N - 1) h[Math.floor(b / N) * (N - 1) + (b % N)] = '>';
    else if (b === a + N) v[a] = '<';
    else if (a === b + N) v[b] = '>';
  }
  return Array.from(giv, (d) => (d ? String(d) : '.')).join('') + h.join('') + v.join('');
}

// --- état de recherche : candidats par case ---------------------------------

export function newState(p) {
  const { N, NN, full } = geo(p.N);
  const cand = new Uint16Array(NN).fill(full);
  for (let i = 0; i < NN; i++) if (p.giv[i]) cand[i] = bit(p.giv[i]);
  const lt = Array.from({ length: NN }, () => []); // lt[i] : cases plus petites que i
  const gt = Array.from({ length: NN }, () => []); // gt[i] : cases plus grandes que i
  for (const [a, b] of p.rel) { gt[a].push(b); lt[b].push(a); }
  return { N, cand, lt, gt };
}
const cloneState = (st) => ({ ...st, cand: st.cand.slice() });

/** Retire les chiffres posés des cases de la même ligne/colonne ; true si impasse. */
function settle(st) {
  const { N, lines } = geo(st.N);
  const { cand } = st;
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (const line of lines) {
      for (const i of line) {
        if (cand[i] === 0) return true;
        if (pop(cand[i]) !== 1) continue;
        for (const j of line) {
          if (j !== i && (cand[j] & cand[i])) {
            cand[j] &= ~cand[i];
            moved = true;
            if (cand[j] === 0) return true;
          }
        }
      }
    }
    if (!moved) return false;
  }
  return false;
}

function stepHidden(st) {
  const { N, lines } = geo(st.N);
  for (let u = 0; u < lines.length; u++) {
    for (let d = 1; d <= N; d++) {
      let n = 0;
      let at = -1;
      for (const i of lines[u]) if (st.cand[i] & bit(d)) { n++; at = i; }
      if (n === 1 && st.cand[at] !== bit(d)) { const _r = emitStep({ tech: 'single', level: 1, set: [[at, bit(d)]], units: [u], focus: [at] }); if (_r) return _r; }
    }
  }
  return null;
}

function stepBound(st) {
  const { cand, lt, gt } = st;
  for (let i = 0; i < cand.length; i++) {
    // i doit être plus petit que chaque case de gt[i] : donc < au plus grand chiffre possible de chacune
    for (const j of gt[i]) {
      const hi = bitLen(cand[j]);
      const keep = cand[i] & ((1 << (hi - 1)) - 1);
      if (keep !== cand[i]) { const _r = emitStep({ tech: 'bound', level: 2, set: [[i, keep]], units: [], focus: [i, j] }); if (_r) return _r; }
      const lo = lowDigit(cand[i]);
      const keepJ = cand[j] & ~((1 << lo) - 1);
      if (keepJ !== cand[j]) { const _r = emitStep({ tech: 'bound', level: 2, set: [[j, keepJ]], units: [], focus: [i, j] }); if (_r) return _r; }
    }
  }
  return null;
}

function combos(arr, k, from = 0, cur = [], out = []) {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = from; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
  return out;
}

/** Paires (k=2) ou triplets (k=3), nus ou cachés, dans chaque ligne et colonne. */
function stepSubset(st, k) {
  const { N, lines } = geo(st.N);
  const level = k === 2 ? 3 : 4;
  const tech = k === 2 ? 'pair' : 'triple';
  for (let u = 0; u < lines.length; u++) {
    const line = lines[u];
    const open = line.filter((i) => pop(st.cand[i]) > 1 || true).filter((i) => pop(st.cand[i]) <= k);
    for (const cs of combos(open.filter((i) => pop(st.cand[i]) > 1 || true), k)) {
      let union = 0;
      for (const i of cs) union |= st.cand[i];
      if (pop(union) !== k || cs.some((i) => pop(st.cand[i]) === 1)) continue;
      const set = [];
      for (const j of line) if (!cs.includes(j) && (st.cand[j] & union)) set.push([j, st.cand[j] & ~union]);
      if (set.length) { const _r = emitStep({ tech, level, set, units: [u], focus: cs }); if (_r) return _r; }
    }
    // cachés : k chiffres dont les places tiennent dans k cases
    const digits = [];
    for (let d = 1; d <= N; d++) {
      const places = line.filter((i) => st.cand[i] & bit(d));
      if (places.length > 1 && places.length <= k) digits.push(d);
    }
    for (const ds of combos(digits, k)) {
      let cellsMask = new Set();
      for (const d of ds) for (const i of line) if (st.cand[i] & bit(d)) cellsMask.add(i);
      if (cellsMask.size !== k) continue;
      let dm = 0;
      for (const d of ds) dm |= bit(d);
      const set = [];
      for (const i of cellsMask) if (st.cand[i] & ~dm) set.push([i, st.cand[i] & dm]);
      if (set.length) { const _r = emitStep({ tech, level, set, units: [u], focus: [...cellsMask] }); if (_r) return _r; }
    }
  }
  return null;
}

const applyStep = (st, s) => { for (const [i, m] of s.set) st.cand[i] = m; };

function propagate(st, maxLevel) {
  if (settle(st)) return true;
  for (let guard = 0; guard < 600; guard++) {
    if (st.cand.some((m) => m === 0)) return true;
    if (st.cand.every((m) => pop(m) === 1)) return false;
    const s = findStep(st, maxLevel, false);
    if (!s) return false;
    applyStep(st, s);
    if (settle(st)) return true;
  }
  return false;
}

function stepTrial(st) {
  for (let i = 0; i < st.cand.length; i++) {
    if (pop(st.cand[i]) < 2) continue;
    for (let d = 1; d <= st.N; d++) {
      if (!(st.cand[i] & bit(d))) continue;
      const t = cloneState(st);
      t.cand[i] = bit(d);
      if (propagate(t, 4)) { const _r = emitStep({ tech: 'trial', level: 5, digit: d, set: [[i, st.cand[i] & ~bit(d)]], units: [], focus: [i] }); if (_r) return _r; }
    }
  }
  return null;
}



// --- énumération des déductions (indices) : voir js/core/hint.js ---
let sink = null;
const STOP = { stop: true };
/** Pendant l'énumération, remplace « return pas » par un enregistrement et continue le balayage. */
function emitStep(s) {
  if (!sink) return s;
  if (s.level > sink.max || (sink.length && s.level > sink.min)) return null;
  sink.push(s);
  if (s.level < sink.min) sink.min = s.level;
  if (sink.length >= (s.level >= 3 ? 4 : 40)) throw STOP;
  return null;
}

/** Prochaine déduction de niveau <= maxLevel, la plus simple d'abord. */
function findStep0(st, maxLevel = 5, allowTrial = true) {
  let s = stepHidden(st);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepBound(st))) return s;
  if (maxLevel >= 3 && (s = stepSubset(st, 2))) return s;
  if (maxLevel >= 4 && (s = stepSubset(st, 3))) return s;
  if (maxLevel >= 5 && allowTrial && (s = stepTrial(st))) return s;
  return null;
}

export function findStep(st, maxLevel = 5, allowTrial = true) {
  const saved = sink;
  sink = null;
  try {
    return findStep0(st, maxLevel, allowTrial);
  } finally {
    sink = saved;
  }
}

/** Toutes les déductions disponibles au niveau de technique le plus simple (indices). */
export function allSteps(st, maxLevel = 5, allowTrial = true) {
  sink = [];
  sink.max = maxLevel;
  sink.min = 99;
  const go = (f, heavy) => { if (sink.length && heavy) return; f(); };
  try {
    go(() => stepHidden(st));
    if (maxLevel >= 2) go(() => stepBound(st));
    if (maxLevel >= 3) go(() => stepSubset(st, 2));
    if (maxLevel >= 4) go(() => stepSubset(st, 3));
    if (maxLevel >= 5 && allowTrial) go(() => stepTrial(st), true);
  }
  catch (e) { if (e !== STOP) throw e; }
  const r = sink; sink = null;
  return r;
}


/**
 * Prochain placement pour l'indice : le plus facile, et à égalité le plus proche de `last` ([ligne, colonne]).
 * Renvoie { cell, digit, step, prior } (step.tech 'naked' si un seul chiffre reste dans la case) ou null.
 */
export function planPlacement(p, grid, last = null, rnd = Math.random) {
  const N = p.N;
  const st = newState({ N, giv: Int8Array.from(grid), rel: p.rel });
  if (settle(st)) return null;
  const rc = (i) => [Math.floor(i / N), i % N];
  const naked = [];
  for (let i = 0; i < st.cand.length; i++) if (pop(st.cand[i]) === 1 && !grid[i]) naked.push(i);
  if (naked.length) {
    let best = naked[Math.floor(rnd() * naked.length)];
    if (last) best = naked.reduce((a, b) => (manhattan(rc(b), last) < manhattan(rc(a), last) ? b : a));
    return { cell: best, digit: lowDigit(st.cand[best]), step: { tech: 'naked', level: 0, focus: [best], units: [] }, prior: [] };
  }
  const newly = (s) => {
    const t = { ...st, cand: st.cand.slice() };
    applyStep(t, s);
    if (settle(t)) return [];
    const out = [];
    for (let i = 0; i < t.cand.length; i++) if (pop(t.cand[i]) === 1 && pop(st.cand[i]) > 1) out.push(i);
    return out;
  };
  const plan = planHint({
    collect: () => allSteps(st, 5),
    apply: (s) => { applyStep(st, s); settle(st); },
    fresh: (s) => newly(s),
    where: (s, f) => f.map(rc),
    last,
    rnd,
  });
  if (!plan) return null;
  const own = new Set(plan.step.tech === 'single' ? plan.step.focus : []);
  const cells = plan.fresh.slice().sort((a, b) => (own.has(b) - own.has(a)) || (last ? manhattan(rc(a), last) - manhattan(rc(b), last) : 0));
  const cell = cells[0];
  const t = { ...st, cand: st.cand.slice() };
  applyStep(t, plan.step);
  settle(t);
  return { cell, digit: lowDigit(t.cand[cell]), step: plan.step, prior: plan.prior };
}

export const stateSettle = settle;
export const solvedDigits = (st) => Int8Array.from(st.cand, (m) => (pop(m) === 1 ? lowDigit(m) : 0));

/** Résout avec les techniques ; renvoie { solved, rating, counts, grid }. */
export function solveWithTechniques(p, { maxLevel = 5 } = {}) {
  const st = newState(p);
  const counts = {};
  let rating = 0;
  if (settle(st)) return { solved: false, rating, counts, grid: solvedDigits(st) };
  for (let guard = 0; guard < 800; guard++) {
    if (st.cand.every((m) => pop(m) === 1)) return { solved: true, rating, counts, grid: solvedDigits(st) };
    const s = findStep(st, maxLevel);
    if (!s) return { solved: false, rating, counts, grid: solvedDigits(st) };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    applyStep(st, s);
    if (settle(st)) return { solved: false, rating, counts, grid: solvedDigits(st) };
  }
  return { solved: false, rating, counts, grid: solvedDigits(st) };
}

/** Une grille complète respecte-t-elle toutes les règles ? */
export function isValid(grid, p) {
  const { N, lines } = geo(p.N);
  for (const line of lines) {
    let m = 0;
    for (const i of line) { if (!grid[i]) return false; m |= bit(grid[i]); }
    if (m !== (1 << N) - 1) return false;
  }
  for (const [a, b] of p.rel) if (!(grid[a] < grid[b])) return false;
  return p.giv.every((d, i) => !d || grid[i] === d);
}

/** Nombre de solutions (plafonné) et première solution. */
export function countSolutions(p, limit = 2) {
  let count = 0;
  let first = null;
  const rec = (st) => {
    if (propagate(st, 3)) return false;
    let best = -1;
    for (let i = 0; i < st.cand.length; i++) {
      const n = pop(st.cand[i]);
      if (n > 1 && (best < 0 || n < pop(st.cand[best]))) best = i;
    }
    if (best < 0) {
      const g = solvedDigits(st);
      if (!isValid(g, p)) return false;
      count++;
      if (!first) first = g;
      return count >= limit;
    }
    for (let d = 1; d <= st.N; d++) {
      if (!(st.cand[best] & bit(d))) continue;
      const t = cloneState(st);
      t.cand[best] = bit(d);
      if (rec(t)) return true;
    }
    return false;
  };
  rec(newState(p));
  return { count, sol: first };
}

/** Carré latin aléatoire. rng : { int, shuffle }. */
export function randomLatin(N, rng) {
  const g = new Int8Array(N * N);
  const rowMask = new Array(N).fill(0);
  const colMask = new Array(N).fill(0);
  const rec = (i) => {
    if (i === N * N) return true;
    const r = Math.floor(i / N);
    const c = i % N;
    for (const d of rng.shuffle(Array.from({ length: N }, (_, k) => k + 1))) {
      if ((rowMask[r] | colMask[c]) & bit(d)) continue;
      g[i] = d; rowMask[r] |= bit(d); colMask[c] |= bit(d);
      if (rec(i + 1)) return true;
      rowMask[r] &= ~bit(d); colMask[c] &= ~bit(d);
    }
    return false;
  };
  rec(0);
  return g;
}

/**
 * Candidats déduits d'une grille de chiffres (lignes, colonnes et bornes des signes), pour les notes automatiques.
 * En cas d'incohérence, on se limite aux lignes et colonnes.
 */
export function autoCandidates(p, grid) {
  const base = { N: p.N, giv: Int8Array.from(grid), rel: p.rel };
  const st = newState(base);
  const plain = cloneState(st);
  settle(plain);
  if (propagate(st, 2)) return plain.cand;
  return st.cand;
}

/**
 * Prochain chiffre déductible à partir des seuls chiffres justes du joueur, avec la chaîne de déductions
 * (techniques intermédiaires comprises). Renvoie { cell, digit, step, prior } ou null.
 */
export function nextPlacement(p, grid) {
  const st = newState({ N: p.N, giv: Int8Array.from(grid), rel: p.rel });
  if (settle(st)) return null;
  const known = new Set();
  st.cand.forEach((m, i) => { if (pop(m) === 1) known.add(i); });
  const prior = [];
  for (let guard = 0; guard < 800; guard++) {
    const s = findStep(st, 5);
    if (!s) return null;
    applyStep(st, s);
    if (settle(st)) return null;
    for (let i = 0; i < st.cand.length; i++) {
      if (pop(st.cand[i]) === 1 && !known.has(i)) return { cell: i, digit: lowDigit(st.cand[i]), step: s, prior };
    }
    prior.push(s.tech);
  }
  return null;
}
