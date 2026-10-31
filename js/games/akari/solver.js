// Akari : des ampoules sur les cases blanches ; chacune éclaire sa ligne et sa colonne jusqu'au mur.
// Toutes les cases blanches doivent être éclairées, aucune ampoule n'en éclaire une autre,
// un mur numéroté touche exactement ce nombre d'ampoules.
//
// Chaîne d'une grille : N*N caractères, . case blanche, # mur sans chiffre, 0..4 mur numéroté.
// État de recherche cs : -1 inconnue, 0 pas d'ampoule, 1 ampoule, 2 mur.
// Techniques (niveau) : basic 1 (murs, cases éclairées, case éclairable d'un seul endroit),
// combo 2 (combinaisons autour d'un mur chiffré), trial2 3 (hypothèse démentie par le niveau 2),
// trial3 4 (hypothèse démentie par le niveau 3).

const GEOS = new WeakMap();

export function parsePuz(s, N) {
  const NN = N * N;
  const wall = new Uint8Array(NN);
  const num = new Int8Array(NN).fill(-1);
  for (let i = 0; i < NN; i++) {
    const ch = s[i];
    if (ch === '.') continue;
    wall[i] = 1;
    if (ch !== '#') num[i] = +ch;
  }
  return { N, wall, num };
}
export const formatPuz = (p) => Array.from(p.wall, (w, i) => (!w ? '.' : p.num[i] < 0 ? '#' : String(p.num[i]))).join('');

/** Géométrie d'une grille : segments, cases vues depuis chaque case, voisines blanches des murs. */
export function geoOf(p) {
  let g = GEOS.get(p);
  if (g) return g;
  const { N, wall } = p;
  const NN = N * N;
  const hseg = new Int16Array(NN).fill(-1);
  const vseg = new Int16Array(NN).fill(-1);
  const segs = [];
  for (let r = 0; r < N; r++) {
    let cur = null;
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (wall[i]) { cur = null; continue; }
      if (!cur) { cur = []; segs.push(cur); }
      cur.push(i);
      hseg[i] = segs.length - 1;
    }
  }
  for (let c = 0; c < N; c++) {
    let cur = null;
    for (let r = 0; r < N; r++) {
      const i = r * N + c;
      if (wall[i]) { cur = null; continue; }
      if (!cur) { cur = []; segs.push(cur); }
      cur.push(i);
      vseg[i] = segs.length - 1;
    }
  }
  const view = new Array(NN).fill(null);
  const nbr = new Array(NN).fill(null);
  for (let i = 0; i < NN; i++) {
    if (!wall[i]) {
      view[i] = [...segs[hseg[i]], ...segs[vseg[i]].filter((j) => j !== i)];
    } else {
      const r = Math.floor(i / N);
      const c = i % N;
      nbr[i] = [];
      if (r > 0 && !wall[i - N]) nbr[i].push(i - N);
      if (r < N - 1 && !wall[i + N]) nbr[i].push(i + N);
      if (c > 0 && !wall[i - 1]) nbr[i].push(i - 1);
      if (c < N - 1 && !wall[i + 1]) nbr[i].push(i + 1);
    }
  }
  const whites = [];
  for (let i = 0; i < NN; i++) if (!wall[i]) whites.push(i);
  const numbered = [];
  for (let i = 0; i < NN; i++) if (wall[i] && p.num[i] >= 0) numbered.push(i);
  g = { N, NN, hseg, vseg, segs, view, nbr, whites, numbered };
  GEOS.set(p, g);
  return g;
}

export function newState(p) {
  const cs = new Int8Array(p.N * p.N).fill(-1);
  p.wall.forEach((w, i) => { if (w) cs[i] = 2; });
  return { p, g: geoOf(p), cs };
}
const cloneState = (st) => ({ ...st, cs: st.cs.slice() });

/** Cause de la violation : { kind: twobulbs|dark|wallOver|wallUnder, ... } ou null. */
export function whyBroken(st) {
  const { cs, g } = st;
  for (const i of g.whites) {
    const vi = g.view[i];
    if (cs[i] === 1) {
      for (const j of vi) if (j !== i && cs[j] === 1) return { kind: 'twobulbs', cells: [i, j] };
    } else {
      let possible = false;
      for (const j of vi) if (cs[j] !== 0) { possible = true; break; }
      if (!possible) return { kind: 'dark', cell: i };
    }
  }
  for (const w of g.numbered) {
    let b = 0;
    let u = 0;
    for (const j of g.nbr[w]) { if (cs[j] === 1) b++; else if (cs[j] === -1) u++; }
    const k = st.p.num[w];
    if (b > k) return { kind: 'wallOver', cell: w, k };
    if (b + u < k) return { kind: 'wallUnder', cell: w, k };
  }
  return null;
}

/** Une règle est déjà violée. */
export function broken(st) {
  const { cs, g } = st;
  for (const i of g.whites) {
    const vi = g.view[i];
    if (cs[i] === 1) {
      for (const j of vi) if (j !== i && cs[j] === 1) return true;
    } else {
      let possible = false;
      for (const j of vi) if (cs[j] !== 0) { possible = true; break; }
      if (!possible) return true;
    }
  }
  for (const w of g.numbered) {
    let b = 0;
    let u = 0;
    for (const j of g.nbr[w]) { if (cs[j] === 1) b++; else if (cs[j] === -1) u++; }
    const k = st.p.num[w];
    if (b > k || b + u < k) return true;
  }
  return false;
}

/** Lumière : cases éclairées par les ampoules posées (Uint8Array 0/1). */
export function litCells(p, cs) {
  const g = geoOf(p);
  const lit = new Uint8Array(cs.length);
  for (const i of g.whites) if (cs[i] === 1) for (const j of g.view[i]) lit[j] = 1;
  return lit;
}

/** La grille complète est-elle une solution ? */
export function isSolution(p, cs) {
  const g = geoOf(p);
  if (cs.includes(-1)) return false;
  const lit = litCells(p, cs);
  for (const i of g.whites) {
    if (!lit[i]) return false;
    if (cs[i] === 1) for (const j of g.view[i]) if (j !== i && cs[j] === 1) return false;
  }
  for (const w of g.numbered) {
    let b = 0;
    for (const j of g.nbr[w]) if (cs[j] === 1) b++;
    if (b !== p.num[w]) return false;
  }
  return true;
}

const apply = (st, s) => { for (const [i, v] of s.cells) st.cs[i] = v; };

function stepBasic(st) {
  const { cs, g, p } = st;
  for (const w of g.numbered) {
    let b = 0;
    const unk = [];
    for (const j of g.nbr[w]) { if (cs[j] === 1) b++; else if (cs[j] === -1) unk.push(j); }
    if (!unk.length) continue;
    const need = p.num[w] - b;
    if (need === 0) { const _r = emitStep({ tech: p.num[w] === 0 ? 'zero' : 'done', level: 1, cells: unk.map((j) => [j, 0]), focus: [w, ...unk] }); if (_r) return _r; }
    if (need === unk.length) { const _r = emitStep({ tech: 'full', level: 1, cells: unk.map((j) => [j, 1]), focus: [w, ...unk] }); if (_r) return _r; }
  }
  for (const i of g.whites) {
    if (cs[i] !== 1) continue;
    const out = g.view[i].filter((j) => j !== i && cs[j] === -1).map((j) => [j, 0]);
    if (out.length) { const _r = emitStep({ tech: 'lit', level: 1, cells: out, focus: [i], lines: [i] }); if (_r) return _r; }
  }
  const lit = litCells(p, cs);
  for (const i of g.whites) {
    if (lit[i]) continue;
    const src = g.view[i].filter((j) => cs[j] === -1);
    if (src.length === 1) { const _r = emitStep({ tech: 'only', level: 1, cells: [[src[0], 1]], focus: [i, src[0]], lines: [i] }); if (_r) return _r; }
  }
  return null;
}

function combos(arr, k) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

/** Combinaisons possibles autour d'un mur chiffré : ce qui vaut pour toutes est déduit. */
function stepCombo(st) {
  const { cs, g, p } = st;
  for (const w of g.numbered) {
    const unk = g.nbr[w].filter((j) => cs[j] === -1);
    if (unk.length < 2) continue;
    let b = 0;
    for (const j of g.nbr[w]) if (cs[j] === 1) b++;
    const need = p.num[w] - b;
    if (need <= 0 || need >= unk.length) continue;
    const ok = [];
    for (const cmb of combos(unk, need)) {
      const t = cloneState(st);
      for (const j of unk) t.cs[j] = cmb.includes(j) ? 1 : 0;
      if (!broken(t)) ok.push(cmb);
    }
    if (!ok.length) continue;
    const out = [];
    for (const j of unk) {
      if (ok.every((c) => c.includes(j))) out.push([j, 1]);
      else if (ok.every((c) => !c.includes(j))) out.push([j, 0]);
    }
    // cases éclairées par une ampoule dans toutes les combinaisons
    for (const x of g.whites) {
      if (cs[x] !== -1 || unk.includes(x) || out.some(([j]) => j === x)) continue;
      if (ok.every((c) => c.some((j) => g.view[j].includes(x)))) out.push([x, 0]);
    }
    if (out.length) { const _r = emitStep({ tech: 'combo', level: 2, cells: out, focus: [w, ...unk], lines: [] }); if (_r) return _r; }
  }
  return null;
}

function propagate(st, maxLevel) {
  for (let guard = 0; guard < 800; guard++) {
    if (broken(st)) return true;
    if (!st.cs.includes(-1)) return false;
    const s = findStep(st, maxLevel);
    if (!s) return false;
    apply(st, s);
  }
  return false;
}

/** Hypothèse sur une case, propagée jusqu'au niveau `lvl - 1` ; une impasse prouve l'inverse. */
function stepTrial(st, lvl) {
  for (const i of st.g.whites) {
    if (st.cs[i] !== -1) continue;
    for (const v of [1, 0]) {
      const t = cloneState(st);
      t.cs[i] = v;
      if (propagate(t, lvl - 1)) {
        const ghost = [];
        for (let j = 0; j < t.cs.length; j++) if (j !== i && t.cs[j] === 1 && st.cs[j] === -1) ghost.push([j, 1]);
        const _r = emitStep({ tech: `trial${lvl - 1}`, level: lvl, cells: [[i, 1 - v]], focus: [i], why: { hyp: [i, v], ghost, fail: whyBroken(t) } });
        if (_r) return _r;
      }
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
function findStep0(st, maxLevel = 4) {
  let s = stepBasic(st);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepCombo(st))) return s;
  if (maxLevel >= 3 && (s = stepTrial(st, 3))) return s;
  if (maxLevel >= 4 && (s = stepTrial(st, 4))) return s;
  return null;
}

export function findStep(st, maxLevel = 4) {
  const saved = sink;
  sink = null;
  try {
    return findStep0(st, maxLevel);
  } finally {
    sink = saved;
  }
}

/** Toutes les déductions disponibles au niveau de technique le plus simple (indices). */
export function allSteps(st, maxLevel = 4) {
  sink = [];
  sink.max = maxLevel;
  sink.min = 99;
  const go = (f, heavy) => { if (sink.length && heavy) return; f(); };
  try {
    go(() => stepBasic(st));
    if (maxLevel >= 2) go(() => stepCombo(st));
    if (maxLevel >= 3) go(() => stepTrial(st, 3), true);
    if (maxLevel >= 4) go(() => stepTrial(st, 4), true);
  }
  catch (e) { if (e !== STOP) throw e; }
  const r = sink; sink = null;
  return r;
}


/** Résout avec les techniques ; renvoie { solved, rating, counts, grid }. */
export function solveWithTechniques(p, { maxLevel = 4 } = {}) {
  const st = newState(p);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 800; guard++) {
    if (broken(st)) return { solved: false, rating, counts, grid: st.cs };
    if (!st.cs.includes(-1)) return { solved: isSolution(p, st.cs), rating, counts, grid: st.cs };
    const s = findStep(st, maxLevel);
    if (!s) return { solved: false, rating, counts, grid: st.cs };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    apply(st, s);
  }
  return { solved: false, rating, counts, grid: st.cs };
}

/** Nombre de solutions (plafonné) et première solution (cs : 1 ampoule, 0 sinon, 2 mur). */
export function countSolutions(p, limit = 2) {
  let count = 0;
  let first = null;
  const all = [];
  const rec = (st) => {
    if (propagate(st, 1)) return false;
    const { cs, g } = st;
    // case non éclairée ayant le moins de sources possibles
    const lit = litCells(p, cs);
    let best = null;
    for (const i of g.whites) {
      if (lit[i]) continue;
      const src = g.view[i].filter((j) => cs[j] === -1);
      if (!best || src.length < best.length) best = src;
    }
    if (!best) {
      // tout est éclairé : les cases inconnues restantes n'ont pas d'ampoule
      const t = cloneState(st);
      for (const i of g.whites) if (t.cs[i] === -1) t.cs[i] = 0;
      if (!isSolution(p, t.cs)) return false;
      count++;
      if (!first) first = t.cs.slice();
      all.push(t.cs.slice());
      return count >= limit;
    }
    for (let k = 0; k < best.length; k++) {
      const t = cloneState(st);
      for (let m = 0; m < k; m++) t.cs[best[m]] = 0;
      t.cs[best[k]] = 1;
      if (rec(t)) return true;
    }
    return false;
  };
  rec(newState(p));
  return { count, sol: first, all };
}

/** Grille aléatoire : murs, ampoules, chiffres complets. rng : { int, shuffle, next }. */
export function randomConfig(N, wallRate, rng) {
  const NN = N * N;
  const wall = new Uint8Array(NN);
  for (let i = 0; i < NN; i++) wall[i] = rng.next() < wallRate ? 1 : 0;
  const p = { N, wall, num: new Int8Array(NN).fill(-1) };
  const g = geoOf(p);
  if (g.whites.length < NN / 2) return null;
  const cs = new Int8Array(NN);
  wall.forEach((w, i) => { if (w) cs[i] = 2; });
  const lit = new Uint8Array(NN);
  for (const i of rng.shuffle(g.whites.slice())) {
    if (lit[i]) continue;
    cs[i] = 1;
    for (const j of g.view[i]) lit[j] = 1;
  }
  for (const w of g.numbered) void w;
  for (let i = 0; i < NN; i++) {
    if (!wall[i]) continue;
    let b = 0;
    for (const j of g.nbr[i]) if (cs[j] === 1) b++;
    p.num[i] = b;
  }
  const sol = Int8Array.from(cs, (v) => (v === 1 ? 1 : v === 2 ? 2 : 0));
  return { puz: { N, wall, num: p.num }, sol };
}
