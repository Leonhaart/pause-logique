// Kakuro : des chiffres de 1 à 9 dans les cases blanches ; chaque suite de cases blanches (horizontale ou verticale)
// totalise la somme de la case noire qui la précède, sans répéter de chiffre.
//
// Chaîne d'une grille : N*N cases séparées par des virgules. « . » case blanche, « # » case noire sans consigne,
// « d/r » case noire (d : somme de la suite vers le bas, r : somme de la suite vers la droite, vide si absente).
// Candidats : masque de bits (bit d-1 = chiffre d).
// Techniques (niveau) : naked + combo 1 (chiffres posés, combinaisons de la somme), run 2 (cohérence exacte d'une suite),
// trial2 3 (hypothèse démentie par le niveau 2), trial3 4 (hypothèse démentie par le niveau 3).

const GEOS = new WeakMap();
const FULL = 0x1ff;
const bit = (d) => 1 << (d - 1);
const pop = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const digitOf = (m) => 31 - Math.clz32(m) + 1;
const single = (m) => m !== 0 && (m & (m - 1)) === 0;

export function parsePuz(s, N) {
  const parts = s.split(',');
  const white = new Uint8Array(N * N);
  const down = new Int8Array(N * N);
  const right = new Int8Array(N * N);
  const given = new Int8Array(N * N);
  parts.forEach((tok, i) => {
    if (tok === '.') { white[i] = 1; return; }
    if (/^[1-9]$/.test(tok)) { white[i] = 1; given[i] = +tok; return; }
    if (tok === '#') return;
    const [d, r] = tok.split('/');
    down[i] = d ? +d : 0;
    right[i] = r ? +r : 0;
  });
  return { N, white, down, right, given };
}
export function formatPuz(p) {
  const out = [];
  for (let i = 0; i < p.N * p.N; i++) {
    if (p.white[i]) out.push(p.given?.[i] ? String(p.given[i]) : '.');
    else if (!p.down[i] && !p.right[i]) out.push('#');
    else out.push(`${p.down[i] || ''}/${p.right[i] || ''}`);
  }
  return out.join(',');
}

// Combinaisons de `len` chiffres distincts de somme `sum` : masques
const COMBOS = [];
for (let len = 0; len <= 9; len++) COMBOS.push({});
for (let m = 1; m < 512; m++) {
  let len = 0;
  let sum = 0;
  for (let d = 1; d <= 9; d++) if (m & bit(d)) { len++; sum += d; }
  (COMBOS[len][sum] ??= []).push(m);
}
export const combosOf = (len, sum) => COMBOS[len]?.[sum] ?? [];

/** Géométrie : suites (cases, somme, sens) et suites de chaque case blanche. */
export function geoOf(p) {
  let g = GEOS.get(p);
  if (g) return g;
  const { N, white } = p;
  const runs = [];
  const runOf = new Array(N * N).fill(null).map(() => [-1, -1]);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (white[i]) continue;
      if (c + 1 < N && white[i + 1]) {
        const cells = [];
        for (let k = c + 1; k < N && white[r * N + k]; k++) cells.push(r * N + k);
        runs.push({ cells, sum: p.right[i], dir: 'h', clue: i });
        for (const j of cells) runOf[j][0] = runs.length - 1;
      }
      if (r + 1 < N && white[i + N]) {
        const cells = [];
        for (let k = r + 1; k < N && white[k * N + c]; k++) cells.push(k * N + c);
        runs.push({ cells, sum: p.down[i], dir: 'v', clue: i });
        for (const j of cells) runOf[j][1] = runs.length - 1;
      }
    }
  }
  const whites = [];
  for (let i = 0; i < N * N; i++) if (white[i]) whites.push(i);
  g = { N, runs, runOf, whites };
  GEOS.set(p, g);
  return g;
}

export function newState(p) {
  const g = geoOf(p);
  const cand = new Uint16Array(p.N * p.N);
  for (const i of g.whites) cand[i] = p.given?.[i] ? bit(p.given[i]) : FULL;
  return { p, g, cand };
}
const cloneState = (st) => ({ ...st, cand: st.cand.slice() });

let lastFail = null;

/** Une règle est déjà violée. */
export function broken(st) {
  const { g, cand } = st;
  for (const i of g.whites) if (!cand[i]) return true;
  return false;
}

/** Les valeurs (0 = vide) forment-elles une solution complète ? */
export function isSolution(p, vals) {
  const g = geoOf(p);
  for (const i of g.whites) if (!(vals[i] >= 1 && vals[i] <= 9)) return false;
  for (const run of g.runs) {
    let sum = 0;
    let seen = 0;
    for (const i of run.cells) {
      const b = bit(vals[i]);
      if (seen & b) return false;
      seen |= b;
      sum += vals[i];
    }
    if (sum !== run.sum) return false;
  }
  return true;
}

const apply = (st, s) => { for (const [i, m] of s.changes) st.cand[i] = m; };

function stepNaked(st) {
  const { g, cand } = st;
  for (const i of g.whites) {
    if (!single(cand[i])) continue;
    const b = cand[i];
    const changes = [];
    const runsHit = [];
    for (const ri of g.runOf[i]) {
      if (ri < 0) continue;
      for (const j of g.runs[ri].cells) if (j !== i && cand[j] & b && !changes.some(([x]) => x === j)) { changes.push([j, cand[j] & ~b]); if (!runsHit.includes(ri)) runsHit.push(ri); }
    }
    if (changes.length) { const _r = emitStep({ tech: 'naked', level: 1, changes, focus: [i], runs: runsHit }); if (_r) return _r; }
  }
  return null;
}

function stepCombo(st) {
  const { g, cand } = st;
  for (let ri = 0; ri < g.runs.length; ri++) {
    const run = g.runs[ri];
    let fixed = 0;
    for (const i of run.cells) if (single(cand[i])) fixed |= cand[i];
    let allowed = 0;
    for (const m of combosOf(run.cells.length, run.sum)) if ((m & fixed) === fixed) allowed |= m;
    const changes = [];
    for (const i of run.cells) if (cand[i] & ~allowed) changes.push([i, cand[i] & allowed]);
    if (changes.length) { const _r = emitStep({ tech: 'combo', level: 1, changes, focus: changes.map(([i]) => i), runs: [ri] }); if (_r) return _r; }
  }
  return null;
}

const SUPPORT_CACHE = new Map();

/** Chiffres réellement possibles pour chaque case d'une suite (cohérence exacte). */
function runSupport(run, cand) {
  const cells = run.cells;
  const n = cells.length;
  let key = run.sum * 16 + n + ':';
  for (let x = 0; x < n; x++) key += cand[cells[x]] + ',';
  const hit = SUPPORT_CACHE.get(key);
  if (hit) return hit;
  const res = computeSupport(run, cand);
  if (SUPPORT_CACHE.size > 300000) SUPPORT_CACHE.clear();
  SUPPORT_CACHE.set(key, res);
  return res;
}

function computeSupport(run, cand) {
  const cells = run.cells;
  const n = cells.length;
  const sup = new Array(n).fill(0);
  const pick = new Array(n);
  const rec = (k, used, sum) => {
    if (k === n) {
      if (sum !== run.sum) return;
      for (let x = 0; x < n; x++) sup[x] |= bit(pick[x]);
      return;
    }
    const remain = n - k - 1;
    let m = cand[cells[k]] & ~used;
    while (m) {
      const b = m & -m;
      m ^= b;
      const d = digitOf(b);
      const s = sum + d;
      if (s + remain * (remain + 1) / 2 > run.sum) continue;
      if (s + remain * 9 - remain * (remain - 1) / 2 < run.sum) continue;
      pick[k] = d;
      rec(k + 1, used | b, s);
    }
  };
  rec(0, 0, 0);
  return sup;
}

function stepRun(st) {
  const { g, cand } = st;
  for (let ri = 0; ri < g.runs.length; ri++) {
    const run = g.runs[ri];
    const sup = runSupport(run, cand);
    const changes = [];
    run.cells.forEach((i, x) => { if (cand[i] & ~sup[x]) changes.push([i, cand[i] & sup[x]]); });
    if (changes.length) { const _r = emitStep({ tech: 'run', level: 2, changes, focus: changes.map(([i]) => i), runs: [ri] }); if (_r) return _r; }
  }
  return null;
}

/** Cohérence exacte de toutes les suites jusqu'au point fixe (équivalent des niveaux 1 et 2). true si contradiction. */
function gac(st) {
  const { g, cand } = st;
  const queue = g.runs.map((_, i) => i);
  const queued = new Uint8Array(g.runs.length).fill(1);
  while (queue.length) {
    const ri = queue.pop();
    queued[ri] = 0;
    const run = g.runs[ri];
    const sup = runSupport(run, cand);
    for (let x = 0; x < run.cells.length; x++) {
      const i = run.cells[x];
      const m = cand[i] & sup[x];
      if (!m) { lastFail = { kind: 'support', cell: i, run: ri }; return true; }
      if (m !== cand[i]) {
        cand[i] = m;
        for (const rj of g.runOf[i]) if (rj >= 0 && rj !== ri && !queued[rj]) { queued[rj] = 1; queue.push(rj); }
      }
    }
  }
  return false;
}

/** Version rapide et un peu plus faible (sans test d'affectation) : sûre, réservée au comptage de solutions. */
function fastSupport(run, cand) {
  const cells = run.cells;
  const n = cells.length;
  const sup = new Array(n).fill(0);
  let fixed = 0;
  for (let x = 0; x < n; x++) {
    const m = cand[cells[x]];
    if (single(m)) { if (fixed & m) return null; fixed |= m; }
  }
  for (const S of combosOf(n, run.sum)) {
    if ((S & fixed) !== fixed) continue;
    let ok = true;
    let cover = 0;
    for (let x = 0; x < n; x++) {
      const m = cand[cells[x]] & S;
      if (!m) { ok = false; break; }
      cover |= m;
    }
    if (!ok || cover !== S) continue;
    for (let x = 0; x < n; x++) sup[x] |= cand[cells[x]] & S;
  }
  for (let x = 0; x < n; x++) if (!single(cand[cells[x]])) sup[x] &= ~fixed;
  return sup;
}

function gacFast(st) {
  const { g, cand } = st;
  const queue = g.runs.map((_, i) => i);
  const queued = new Uint8Array(g.runs.length).fill(1);
  while (queue.length) {
    const ri = queue.pop();
    queued[ri] = 0;
    const run = g.runs[ri];
    const sup = fastSupport(run, cand);
    if (!sup) return true;
    for (let x = 0; x < run.cells.length; x++) {
      const i = run.cells[x];
      const m = cand[i] & sup[x];
      if (!m) return true;
      if (m !== cand[i]) {
        cand[i] = m;
        for (const rj of g.runOf[i]) if (rj >= 0 && rj !== ri && !queued[rj]) { queued[rj] = 1; queue.push(rj); }
      }
    }
  }
  return false;
}

function propagate(st, maxLevel) {
  if (maxLevel === 2) return gac(st);
  for (let guard = 0; guard < 3000; guard++) {
    if (broken(st)) return true;
    if (st.g.whites.every((i) => single(st.cand[i]))) return false;
    const s = findStep(st, maxLevel);
    if (!s) return false;
    apply(st, s);
  }
  return false;
}

function stepTrial(st, lvl) {
  const { g, cand } = st;
  const order = g.whites.filter((i) => !single(cand[i])).sort((a, b) => pop(cand[a]) - pop(cand[b]));
  for (const i of order) {
    for (let d = 1; d <= 9; d++) {
      if (!(cand[i] & bit(d))) continue;
      const t = cloneState(st);
      t.cand[i] = bit(d);
      lastFail = null;
      if (propagate(t, lvl - 1)) {
        const ghost = [];
        for (const j of g.whites) if (j !== i && single(t.cand[j]) && !single(cand[j])) ghost.push([j, digitOf(t.cand[j])]);
        const fail = lastFail ?? { kind: 'empty', cell: g.whites.find((j) => !t.cand[j]) };
        const _r = emitStep({ tech: `trial${lvl - 1}`, level: lvl, changes: [[i, cand[i] & ~bit(d)]], focus: [i], runs: g.runOf[i].filter((r) => r >= 0), why: { hyp: [i, d], ghost, fail } });
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
  let s = stepNaked(st) || stepCombo(st);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepRun(st))) return s;
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
    go(() => stepNaked(st));
    go(() => stepCombo(st));
    if (maxLevel >= 2) go(() => stepRun(st));
    if (maxLevel >= 3) go(() => stepTrial(st, 3), true);
    if (maxLevel >= 4) go(() => stepTrial(st, 4), true);
  }
  catch (e) { if (e !== STOP) throw e; }
  const r = sink; sink = null;
  return r;
}


export const valuesOf = (st) => Int8Array.from(st.cand, (m) => (single(m) ? digitOf(m) : 0));

/** Résout avec les techniques ; renvoie { solved, rating, counts, vals }. */
export function solveWithTechniques(p, { maxLevel = 4 } = {}) {
  const st = newState(p);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 3000; guard++) {
    if (broken(st)) return { solved: false, rating, counts, vals: valuesOf(st) };
    if (st.g.whites.every((i) => single(st.cand[i]))) return { solved: isSolution(p, valuesOf(st)), rating, counts, vals: valuesOf(st) };
    const s = findStep(st, maxLevel);
    if (!s) return { solved: false, rating, counts, vals: valuesOf(st) };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    apply(st, s);
  }
  return { solved: false, rating, counts, vals: valuesOf(st) };
}

/** Nombre de solutions (plafonné), première solution et toutes celles trouvées. */
export function countSolutions(p, limit = 2) {
  let count = 0;
  let first = null;
  const all = [];
  const rec = (st) => {
    if (gacFast(st)) return false;
    let best = -1;
    for (const i of st.g.whites) if (!single(st.cand[i]) && (best < 0 || pop(st.cand[i]) < pop(st.cand[best]))) best = i;
    if (best < 0) {
      const v = valuesOf(st);
      if (!isSolution(p, v)) return false;
      count++;
      if (!first) first = v;
      all.push(v);
      return count >= limit;
    }
    for (let d = 1; d <= 9; d++) {
      if (!(st.cand[best] & bit(d))) continue;
      const t = cloneState(st);
      t.cand[best] = bit(d);
      if (rec(t)) return true;
    }
    return false;
  };
  rec(newState(p));
  return { count, sol: first, all };
}

/** Candidats « de départ » d'une grille en cours : chiffres compatibles avec les combinaisons des deux suites. */
export function autoCandidates(p, vals) {
  const g = geoOf(p);
  const out = new Uint16Array(p.N * p.N);
  const allowed = g.runs.map((run) => {
    let placed = 0;
    for (const i of run.cells) if (vals[i]) placed |= bit(vals[i]);
    let a = 0;
    for (const m of combosOf(run.cells.length, run.sum)) if ((m & placed) === placed) a |= m;
    return a & ~placed;
  });
  for (const i of g.whites) {
    if (vals[i]) continue;
    let m = FULL;
    for (const ri of g.runOf[i]) if (ri >= 0) m &= allowed[ri];
    out[i] = m;
  }
  return out;
}

// poids des chiffres au remplissage : les extrêmes donnent des sommes à peu de combinaisons, donc moins d'ambiguïté
const WEIGHT = [3, 2.5, 1.5, 1, 0.8, 1, 1.5, 2.5, 3];

/** Remplissage aléatoire sans répétition dans les suites : Int8Array de chiffres, ou null.
 *  On refuse les « rectangles échangeables » (a b / b a dans deux suites croisées), source classique d'ambiguïté. */
export function randomFill(p, rng) {
  const g = geoOf(p);
  const { N } = p;
  const vals = new Int8Array(N * N);
  let budget = 20000;
  const order = g.whites;
  const sameRun = (a, b, k) => g.runOf[a][k] >= 0 && g.runOf[a][k] === g.runOf[b][k];
  const swappable = (i, d) => {
    const r = Math.floor(i / N);
    const c = i % N;
    for (const j of g.runs[g.runOf[i][0]].cells) {
      if (j >= i) continue; // cases déjà remplies de la suite horizontale
      const e = vals[j];
      const c2 = j % N;
      for (const k of g.runs[g.runOf[i][1]].cells) {
        if (k >= i || vals[k] !== e) continue;
        const l = (k - (k % N)) + c2; // même ligne que k, colonne de j
        if (l !== k && vals[l] === d && sameRun(l, j, 1) && sameRun(l, k, 0)) return true;
      }
    }
    void r; void c;
    return false;
  };
  const rec = (k) => {
    if (k === order.length) return true;
    if (--budget < 0) return false;
    const i = order[k];
    let used = 0;
    for (const ri of g.runOf[i]) if (ri >= 0) for (const j of g.runs[ri].cells) if (vals[j]) used |= bit(vals[j]);
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .filter((d) => !(used & bit(d)) && !swappable(i, d))
      .map((d) => [-Math.log(rng.next() + 1e-9) / WEIGHT[d - 1], d])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1]);
    for (const d of digits) {
      vals[i] = d;
      if (rec(k + 1)) return true;
    }
    vals[i] = 0;
    return false;
  };
  return rec(0) ? vals : null;
}

/** Gabarit aléatoire : première ligne et première colonne noires, cases blanches toutes dans des suites d'au moins 2. */
export function randomLayout(N, density, rng) {
  const white = new Uint8Array(N * N);
  for (let r = 1; r < N; r++) for (let c = 1; c < N; c++) white[r * N + c] = rng.next() < density ? 1 : 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let r = 1; r < N; r++) {
      for (let c = 1; c < N; c++) {
        const i = r * N + c;
        if (!white[i]) continue;
        const h = (c > 1 && white[i - 1]) || (c < N - 1 && white[i + 1]);
        const v = (r > 1 && white[i - N]) || (r < N - 1 && white[i + N]);
        if (!h || !v) { white[i] = 0; changed = true; }
      }
    }
  }
  // connexité : une seule composante
  const seen = new Uint8Array(N * N);
  const comps = [];
  for (let i = 0; i < N * N; i++) {
    if (!white[i] || seen[i]) continue;
    const comp = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const j = comp[k];
      for (const n of [j - 1, j + 1, j - N, j + N]) {
        if (n >= 0 && n < N * N && white[n] && !seen[n] && (Math.abs((n % N) - (j % N)) <= 1)) { seen[n] = 1; comp.push(n); }
      }
    }
    comps.push(comp);
  }
  if (comps.length !== 1) return null;
  return white;
}

/** Construit la grille { N, white, down, right } depuis un gabarit et un remplissage. */
export function withSums(N, white, vals) {
  const p = { N, white, down: new Int8Array(N * N), right: new Int8Array(N * N), given: new Int8Array(N * N) };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (white[i]) continue;
      let s = 0;
      for (let k = c + 1; k < N && white[r * N + k]; k++) s += vals[r * N + k];
      p.right[i] = s;
      s = 0;
      for (let k = r + 1; k < N && white[k * N + c]; k++) s += vals[k * N + c];
      p.down[i] = s;
    }
  }
  return p;
}

/** Retire les cases blanches isolées d'un gabarit (suite de moins de 2 cases) ; false si le résultat n'est plus connexe. */
export function prune(N, white) {
  for (let changed = true; changed;) {
    changed = false;
    for (let r = 1; r < N; r++) {
      for (let c = 1; c < N; c++) {
        const i = r * N + c;
        if (!white[i]) continue;
        const h = (c > 1 && white[i - 1]) || (c < N - 1 && white[i + 1]);
        const v = (r > 1 && white[i - N]) || (r < N - 1 && white[i + N]);
        if (!h || !v) { white[i] = 0; changed = true; }
      }
    }
  }
  const first = white.indexOf(1);
  if (first < 0) return false;
  const seen = new Uint8Array(N * N);
  const comp = [first];
  seen[first] = 1;
  for (let k = 0; k < comp.length; k++) {
    const j = comp[k];
    for (const n of [j - 1, j + 1, j - N, j + N]) {
      if (n >= 0 && n < N * N && white[n] && !seen[n] && Math.abs((n % N) - (j % N)) <= 1) { seen[n] = 1; comp.push(n); }
    }
  }
  return comp.length === white.reduce((a, b) => a + b, 0);
}

/** Rend la grille unique en noircissant des cases où une autre solution diffère ; renvoie { puz, vals } ou null. */
export function makeUnique(N, white0, vals0, rng, minWhites) {
  const white = white0.slice();
  const vals = vals0.slice();
  for (let iter = 0; iter < 60; iter++) {
    const p = withSums(N, white, vals);
    const c = countSolutions(p, 2);
    if (c.count === 1) return { puz: p, vals };
    const alt = c.all.find((s) => g2diff(s, vals, white));
    if (!alt) return null;
    const diff = [];
    for (let i = 0; i < N * N; i++) if (white[i] && alt[i] !== vals[i]) diff.push(i);
    const kill = diff[rng.int(diff.length)];
    white[kill] = 0;
    if (!prune(N, white)) return null;
    if (white.reduce((a, b) => a + b, 0) < minWhites) return null;
  }
  return null;
}
const g2diff = (s, vals, white) => s.some((v, i) => white[i] && v !== vals[i]);

/**
 * Cherche une grille unique : on modifie le remplissage (chiffre d'une case où une autre solution diffère) et, si on
 * n'avance plus, on noircit une de ces cases. { puz, vals } ou null. minWhites : plancher de cases blanches.
 */
export function climbUnique(N, white0, vals0, rng, { steps = 120, deadlineMs = Infinity, minWhites = 0, stuck = 6 } = {}) {
  const white = white0.slice();
  const vals = vals0.slice();
  const t0 = Date.now();
  let g0 = geoOf({ N, white, down: new Int8Array(N * N), right: new Int8Array(N * N) });
  const evaluate = () => {
    const p = withSums(N, white, vals);
    const c = countSolutions(p, 2);
    if (c.count === 1) return { p, size: 0 };
    const alt = c.all.find((s) => s.some((v, i) => white[i] && v !== vals[i])) ?? c.all[0];
    const diff = [];
    for (const i of g0.whites) if (alt[i] !== vals[i]) diff.push(i);
    return { p, size: diff.length, diff };
  };
  let cur = evaluate();
  let idle = 0;
  for (let k = 0; k < steps && cur.size > 0 && Date.now() - t0 < deadlineMs; k++) {
    const i = cur.diff[rng.int(cur.diff.length)];
    if (idle >= stuck) {
      // on noircit une case de la différence
      const keep = white.slice();
      white[i] = 0;
      if (!prune(N, white) || white.reduce((a, b) => a + b, 0) < minWhites) { white.set(keep); idle = 0; continue; }
      g0 = geoOf({ N, white, down: new Int8Array(N * N), right: new Int8Array(N * N) });
      cur = evaluate();
      idle = 0;
      continue;
    }
    const old = vals[i];
    let used = 0;
    for (const ri of g0.runOf[i]) if (ri >= 0) for (const j of g0.runs[ri].cells) if (j !== i && vals[j]) used |= bit(vals[j]);
    const opts = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== old && !(used & bit(d)));
    if (!opts.length) { idle++; continue; }
    vals[i] = opts[rng.int(opts.length)];
    const next = evaluate();
    if (next.size < cur.size) { cur = next; idle = 0; }
    else if (next.size === cur.size) { cur = next; idle++; }
    else { vals[i] = old; idle++; }
  }
  return cur.size === 0 ? { puz: cur.p, vals } : null;
}

/**
 * Fait grandir une grille unique case blanche par case blanche (chaque ajout garde la solution unique).
 * Renvoie { puz, vals } ou null si on n'atteint pas minWhites.
 */
export function growUnique(N, targetWhites, minWhites, rng, { deadlineMs = Infinity, maxRun = 7, accept = null } = {}) {
  const t0 = Date.now();
  const white = new Uint8Array(N * N);
  const vals = new Int8Array(N * N);
  const blank = () => ({ N, white, down: new Int8Array(N * N), right: new Int8Array(N * N) });
  // départ : un bloc 2x2 aux chiffres tous différents
  const r0 = 1 + rng.int(N - 2);
  const c0 = 1 + rng.int(N - 2);
  const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]].forEach(([r, c], k) => { white[r * N + c] = 1; vals[r * N + c] = digits[k]; });
  let puz = withSums(N, white, vals);
  if (countSolutions(puz, 2).count !== 1) return null;
  let count = 4;
  const ok = (r, c) => r >= 1 && c >= 1 && r < N && c < N;
  const wAt = (r, c) => ok(r, c) && white[r * N + c] === 1;
  const hOk = (r, c) => wAt(r, c - 1) || wAt(r, c + 1);
  const vOk = (r, c) => wAt(r - 1, c) || wAt(r + 1, c);
  while (count < targetWhites && Date.now() - t0 < deadlineMs) {
    // ajouts possibles : une case ayant déjà un voisin blanc dans chaque sens, ou un domino dont chaque case en a un dans l'autre sens
    const moves = [];
    for (let r = 1; r < N; r++) {
      for (let c = 1; c < N; c++) {
        if (white[r * N + c]) continue;
        if (hOk(r, c) && vOk(r, c)) moves.push([[r, c]]);
        if (ok(r + 1, c) && !white[(r + 1) * N + c] && hOk(r, c) && hOk(r + 1, c)) moves.push([[r, c], [r + 1, c]]);
        if (ok(r, c + 1) && !white[r * N + c + 1] && vOk(r, c) && vOk(r, c + 1)) moves.push([[r, c], [r, c + 1]]);
      }
    }
    if (!moves.length) break;
    let added = false;
    for (const mv of rng.shuffle(moves).slice(0, 60)) {
      for (const [r, c] of mv) white[r * N + c] = 1;
      const g = geoOf(blank());
      let longRun = false;
      for (const [r, c] of mv) for (const ri of g.runOf[r * N + c]) if (g.runs[ri].cells.length > maxRun) longRun = true;
      if (!longRun) {
        for (let tries = 0; tries < 10 && !added; tries++) {
          for (const [r, c] of mv) {
            const pickD = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [-Math.log(rng.next() + 1e-9) / WEIGHT[d - 1], d]).sort((x, y) => x[0] - y[0])[0][1];
            vals[r * N + c] = pickD;
          }
          const p = withSums(N, white, vals);
          if (isSolution(p, vals) && countSolutions(p, 2).count === 1) { puz = p; added = true; }
        }
      }
      if (added) {
        count += mv.length;
        if (accept && count >= minWhites && accept(puz, count, vals)) return { puz, vals };
        break;
      }
      for (const [r, c] of mv) { white[r * N + c] = 0; vals[r * N + c] = 0; }
    }
    if (!added) break;
  }
  if (accept) return null;
  return count >= minWhites ? { puz, vals } : null;
}
