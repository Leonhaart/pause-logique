// Hashi : des ponts entre des îles numérotées (horizontaux ou verticaux, 2 au plus entre deux îles,
// sans croisement), chaque île a exactement son nombre de ponts, tout le réseau est connexe.
//
// Chaîne d'une grille : N*N caractères, . vide, 1..8 île.
// Une arête relie deux îles voisines (aucune île entre elles) ; son domaine est un masque de bits
// (bit k = « k ponts possible », k = 0, 1, 2).
// Techniques (niveau) : bounds 1 (comptes de l'île, croisements), iso 2 (réseau refermé trop tôt),
// trial2 3 (hypothèse démentie par le niveau 2), trial3 4 (hypothèse démentie par le niveau 3).

const GEOS = new WeakMap();

export function parsePuz(s, N) {
  const num = new Int8Array(N * N);
  for (let i = 0; i < N * N; i++) num[i] = s[i] === '.' ? 0 : +s[i];
  return { N, num };
}
export const formatPuz = (p) => Array.from(p.num, (v) => (v ? String(v) : '.')).join('');

/** Géométrie : îles, arêtes, croisements. */
export function geoOf(p) {
  let g = GEOS.get(p);
  if (g) return g;
  const { N, num } = p;
  const islands = [];
  const id = new Int16Array(N * N).fill(-1);
  for (let i = 0; i < N * N; i++) if (num[i]) { id[i] = islands.length; islands.push({ cell: i, r: Math.floor(i / N), c: i % N, v: num[i] }); }
  const edges = [];
  const inc = islands.map(() => []);
  const addEdge = (a, b, dir, cells) => {
    const max = Math.min(2, islands[a].v, islands[b].v);
    edges.push({ a, b, dir, cells, max });
    inc[a].push(edges.length - 1);
    inc[b].push(edges.length - 1);
  };
  for (const isl of islands) {
    for (let c = isl.c + 1; c < N; c++) {
      const j = isl.r * N + c;
      if (num[j]) { addEdge(id[isl.cell], id[j], 'h', range(isl.cell + 1, j, 1)); break; }
    }
    for (let r = isl.r + 1; r < N; r++) {
      const j = r * N + isl.c;
      if (num[j]) { addEdge(id[isl.cell], id[j], 'v', range(isl.cell + N, j, N)); break; }
    }
  }
  const cross = edges.map(() => []);
  edges.forEach((e, x) => {
    if (e.dir !== 'h') return;
    edges.forEach((f, y) => {
      if (f.dir !== 'v') return;
      if (e.cells.some((c) => f.cells.includes(c))) { cross[x].push(y); cross[y].push(x); }
    });
  });
  g = { N, islands, id, edges, inc, cross };
  GEOS.set(p, g);
  return g;
}
function range(from, to, step) {
  const out = [];
  for (let k = from; k < to; k += step) out.push(k);
  return out;
}

const lo = (m) => (m & 1 ? 0 : m & 2 ? 1 : 2);
const hi = (m) => (m & 4 ? 2 : m & 2 ? 1 : 0);
const size = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
const rangeMask = (a, b) => { let m = 0; for (let k = a; k <= b; k++) m |= 1 << k; return m; };

export function newState(p) {
  const g = geoOf(p);
  const dom = Uint8Array.from(g.edges, (e) => rangeMask(0, e.max));
  return { p, g, dom };
}
const cloneState = (st) => ({ ...st, dom: st.dom.slice() });

/** Composante des îles reliées par des ponts sûrs (min >= 1), avec en option une arête forcée à k. */
function closedComponent(st, forceEdge, k) {
  const { g, dom } = st;
  const n = g.islands.length;
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  const val = (e) => (e === forceEdge ? Math.max(k, lo(dom[e])) : lo(dom[e]));
  g.edges.forEach((e, x) => { if (val(x) >= 1) par[find(e.a)] = find(e.b); });
  const deg = new Int16Array(n);
  g.edges.forEach((e, x) => { const v = val(x); deg[e.a] += v; deg[e.b] += v; });
  const root = forceEdge >= 0 ? find(g.edges[forceEdge].a) : -1;
  const comps = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(i);
  }
  const closed = [];
  for (const [r, members] of comps) {
    if (members.length === n) continue;
    if (forceEdge >= 0 && r !== root) continue;
    if (members.length === 1 && forceEdge < 0) continue;
    if (members.every((i) => deg[i] === g.islands[i].v)) closed.push(members);
  }
  return closed;
}

/** Une règle est déjà violée. */
export function broken(st, iso = false) {
  const { g, dom } = st;
  for (let x = 0; x < dom.length; x++) if (!dom[x]) return true;
  for (let i = 0; i < g.islands.length; i++) {
    let mn = 0;
    let mx = 0;
    for (const x of g.inc[i]) { mn += lo(dom[x]); mx += hi(dom[x]); }
    if (mn > g.islands[i].v || mx < g.islands[i].v) return true;
  }
  if (iso && closedComponent(st, -1, 0).length) return true;
  return false;
}

/** Les valeurs (une par arête) forment-elles une solution complète ? */
export function isSolution(p, vals) {
  const g = geoOf(p);
  const n = g.islands.length;
  const deg = new Int16Array(n);
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (let x = 0; x < g.edges.length; x++) {
    const v = vals[x];
    if (v < 0 || v > g.edges[x].max) return false;
    if (v) {
      for (const y of g.cross[x]) if (vals[y] > 0) return false;
      deg[g.edges[x].a] += v;
      deg[g.edges[x].b] += v;
      par[find(g.edges[x].a)] = find(g.edges[x].b);
    }
  }
  for (let i = 0; i < n; i++) if (deg[i] !== g.islands[i].v || find(i) !== find(0)) return false;
  return true;
}

const apply = (st, s) => { for (const [e, m] of s.changes) st.dom[e] = m; };

function stepBounds(st) {
  const { g, dom } = st;
  for (let i = 0; i < g.islands.length; i++) {
    const v = g.islands[i].v;
    let mn = 0;
    let mx = 0;
    for (const x of g.inc[i]) { mn += lo(dom[x]); mx += hi(dom[x]); }
    const changes = [];
    let allZero = true;
    let raised = false;
    for (const x of g.inc[i]) {
      const a = Math.max(lo(dom[x]), v - (mx - hi(dom[x])));
      const b = Math.min(hi(dom[x]), v - (mn - lo(dom[x])));
      const m = dom[x] & rangeMask(Math.max(a, 0), Math.max(Math.min(b, 2), 0));
      if (m !== dom[x]) {
        changes.push([x, m]);
        if (m !== 1) allZero = false;
        if (a > lo(dom[x])) raised = true;
      }
    }
    if (changes.length) return { tech: allZero ? 'sat' : raised ? 'must' : 'cap', level: 1, changes, focus: [i], edges: changes.map(([x]) => x) };
  }
  for (let x = 0; x < dom.length; x++) {
    if (lo(dom[x]) < 1) continue;
    const changes = [];
    for (const y of g.cross[x]) if (dom[y] !== 1) changes.push([y, dom[y] & 1]);
    if (changes.length) return { tech: 'cross', level: 1, changes, focus: [g.edges[x].a, g.edges[x].b], edges: [x, ...changes.map(([y]) => y)] };
  }
  return null;
}

function stepIso(st) {
  const { g, dom } = st;
  for (let x = 0; x < dom.length; x++) {
    for (const k of [1, 2]) {
      if (!(dom[x] & (1 << k))) continue;
      if (closedComponent(st, x, k).length) {
        return { tech: 'iso', level: 2, changes: [[x, dom[x] & ~(1 << k)]], focus: [g.edges[x].a, g.edges[x].b], edges: [x] };
      }
    }
  }
  return null;
}

function propagate(st, maxLevel) {
  for (let guard = 0; guard < 2000; guard++) {
    if (broken(st, maxLevel >= 2)) return true;
    if (st.dom.every((m) => size(m) === 1)) return false;
    const s = findStep(st, maxLevel);
    if (!s) return false;
    apply(st, s);
  }
  return false;
}

function stepTrial(st, lvl) {
  const { g, dom } = st;
  for (let x = 0; x < dom.length; x++) {
    if (size(dom[x]) < 2) continue;
    for (const k of [0, 1, 2]) {
      if (!(dom[x] & (1 << k))) continue;
      const t = cloneState(st);
      t.dom[x] = 1 << k;
      if (propagate(t, lvl - 1)) return { tech: `trial${lvl - 1}`, level: lvl, changes: [[x, dom[x] & ~(1 << k)]], focus: [g.edges[x].a, g.edges[x].b], edges: [x] };
    }
  }
  return null;
}

/** Prochaine déduction de niveau <= maxLevel, la plus simple d'abord. */
export function findStep(st, maxLevel = 4) {
  let s = stepBounds(st);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepIso(st))) return s;
  if (maxLevel >= 3 && (s = stepTrial(st, 3))) return s;
  if (maxLevel >= 4 && (s = stepTrial(st, 4))) return s;
  return null;
}

export const valuesOf = (st) => Int8Array.from(st.dom, (m) => (size(m) === 1 ? lo(m) : -1));

/** Résout avec les techniques ; renvoie { solved, rating, counts, vals }. */
export function solveWithTechniques(p, { maxLevel = 4 } = {}) {
  const st = newState(p);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (broken(st, true)) return { solved: false, rating, counts, vals: valuesOf(st) };
    if (st.dom.every((m) => size(m) === 1)) return { solved: isSolution(p, valuesOf(st)), rating, counts, vals: valuesOf(st) };
    const s = findStep(st, maxLevel);
    if (!s) return { solved: false, rating, counts, vals: valuesOf(st) };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    apply(st, s);
  }
  return { solved: false, rating, counts, vals: valuesOf(st) };
}

/** Nombre de solutions (plafonné), première solution et toutes les solutions trouvées. */
export function countSolutions(p, limit = 2) {
  let count = 0;
  let first = null;
  const all = [];
  const rec = (st) => {
    if (propagate(st, 2)) return false;
    let best = -1;
    for (let x = 0; x < st.dom.length; x++) {
      if (size(st.dom[x]) > 1 && (best < 0 || size(st.dom[x]) < size(st.dom[best]))) best = x;
    }
    if (best < 0) {
      const v = valuesOf(st);
      if (!isSolution(p, v)) return false;
      count++;
      if (!first) first = v;
      all.push(v);
      return count >= limit;
    }
    for (const k of [0, 1, 2]) {
      if (!(st.dom[best] & (1 << k))) continue;
      const t = cloneState(st);
      t.dom[best] = 1 << k;
      if (rec(t)) return true;
    }
    return false;
  };
  rec(newState(p));
  return { count, sol: first, all };
}

/** Grille aléatoire : réseau d'îles connexe, nombres déduits. rng : { int, next, shuffle }. */
export function randomConfig(N, islandsWanted, loopRate, rng) {
  const occ = new Uint8Array(N * N); // 0 libre, 1 île, 2 pont
  const isl = [];
  const bridge = new Map(); // "a-b" -> nombre
  const first = rng.int(N * N);
  occ[first] = 1;
  isl.push(first);
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const vals = [];
  for (let tries = 0; isl.length < islandsWanted && tries < 400; tries++) {
    const a = isl[rng.int(isl.length)];
    const [dr, dc] = dirs[rng.int(4)];
    const L = 2 + rng.int(Math.max(1, N - 2));
    const r0 = Math.floor(a / N);
    const c0 = a % N;
    const r1 = r0 + dr * L;
    const c1 = c0 + dc * L;
    if (r1 < 0 || r1 >= N || c1 < 0 || c1 >= N) continue;
    const t = r1 * N + c1;
    let ok = occ[t] === 0;
    const between = [];
    for (let k = 1; k < L && ok; k++) {
      const j = (r0 + dr * k) * N + c0 + dc * k;
      if (occ[j] !== 0) ok = false;
      between.push(j);
    }
    if (!ok) continue;
    occ[t] = 1;
    isl.push(t);
    for (const j of between) occ[j] = 2;
    bridge.set(`${a}-${t}`, rng.next() < 0.4 ? 2 : 1);
  }
  const num = new Int8Array(N * N);
  for (const [k, v] of bridge) { const [a, b] = k.split('-').map(Number); num[a] += v; num[b] += v; }
  for (const i of isl) if (!num[i]) num[i] = 1;
  const pz = { N, num };
  const g = geoOf(pz);
  // ponts supplémentaires entre îles voisines (boucles)
  const sol = new Int8Array(g.edges.length);
  g.edges.forEach((e, x) => {
    const ca = g.islands[e.a].cell;
    const cb = g.islands[e.b].cell;
    sol[x] = bridge.get(`${ca}-${cb}`) ?? bridge.get(`${cb}-${ca}`) ?? 0;
  });
  g.edges.forEach((e, x) => {
    if (sol[x] || e.cells.some((c) => occ[c] !== 0) || rng.next() >= loopRate) return;
    if (g.cross[x].some((y) => sol[y] > 0)) return;
    sol[x] = rng.next() < 0.4 ? 2 : 1;
    for (const c of e.cells) occ[c] = 2;
  });
  num.fill(0);
  g.edges.forEach((e, x) => { num[g.islands[e.a].cell] += sol[x]; num[g.islands[e.b].cell] += sol[x]; });
  for (const i of isl) if (!num[i] || num[i] > 8) return null;
  void vals;
  const puz = { N, num };
  const g2 = geoOf(puz);
  const sol2 = Int8Array.from(g2.edges, (e) => {
    const ca = g2.islands[e.a].cell;
    const cb = g2.islands[e.b].cell;
    const x = g.edges.findIndex((f) => g.islands[f.a].cell === ca && g.islands[f.b].cell === cb);
    return sol[x];
  });
  return { puz, sol: sol2 };
}
