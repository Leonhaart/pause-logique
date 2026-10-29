// Slitherlink : solveur, comptage de solutions, techniques de déduction.
// Grille N×N cases ; chiffres 0-3 ou absent. Les traits forment une seule boucle fermée.
//
// Chaîne d'une grille : N*N caractères, `.` pas de chiffre, `0`-`3` chiffre.
// Arêtes : horizontales d'abord (N+1 lignes de N), puis verticales (N lignes de N+1).
// État d'une arête : 0 inconnue, 1 trait, 2 croix (pas de trait).
//
// Niveaux des techniques : 1 règles directes (chiffre, sommet, fermeture de boucle),
// 2 combinaisons autour d'un chiffre (avec contrôle des sommets), 3 essai logique.

const GEOS = new Map();

export function geoOf(N) {
  let g = GEOS.get(N);
  if (g) return g;
  const HN = (N + 1) * N;
  const E = 2 * HN;
  const V = (N + 1) * (N + 1);
  const hEdge = (r, c) => r * N + c;
  const vEdge = (r, c) => HN + r * (N + 1) + c;
  const vid = (r, c) => r * (N + 1) + c;
  const edgeV = new Int16Array(E * 2);
  const vertEdges = Array.from({ length: V }, () => []);
  const edgeCells = Array.from({ length: E }, () => []);
  for (let r = 0; r <= N; r++) {
    for (let c = 0; c < N; c++) {
      const e = hEdge(r, c);
      edgeV[e * 2] = vid(r, c);
      edgeV[e * 2 + 1] = vid(r, c + 1);
      vertEdges[vid(r, c)].push(e);
      vertEdges[vid(r, c + 1)].push(e);
      if (r > 0) edgeCells[e].push((r - 1) * N + c);
      if (r < N) edgeCells[e].push(r * N + c);
    }
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c <= N; c++) {
      const e = vEdge(r, c);
      edgeV[e * 2] = vid(r, c);
      edgeV[e * 2 + 1] = vid(r + 1, c);
      vertEdges[vid(r, c)].push(e);
      vertEdges[vid(r + 1, c)].push(e);
      if (c > 0) edgeCells[e].push(r * N + c - 1);
      if (c < N) edgeCells[e].push(r * N + c);
    }
  }
  const cellEdges = [];
  const cellVerts = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      cellEdges.push([hEdge(r, c), hEdge(r + 1, c), vEdge(r, c), vEdge(r, c + 1)]);
      cellVerts.push([vid(r, c), vid(r, c + 1), vid(r + 1, c), vid(r + 1, c + 1)]);
    }
  }
  g = { N, HN, E, V, edgeV, vertEdges, edgeCells, cellEdges, cellVerts, hEdge, vEdge, vid };
  GEOS.set(N, g);
  return g;
}

export function parsePuz(s, N) {
  const clue = new Int8Array(N * N).fill(-1);
  for (let i = 0; i < N * N; i++) {
    const ch = s[i];
    if (ch >= '0' && ch <= '4') clue[i] = +ch;
  }
  return { N, clue };
}
export const formatPuz = (p) => Array.from(p.clue, (v) => (v < 0 ? '.' : String(v))).join('');

export function newState(p) {
  return { p, g: geoOf(p.N), e: new Int8Array(geoOf(p.N).E) };
}
const clone = (st) => ({ p: st.p, g: st.g, e: st.e.slice() });

const cellCount = (st, c) => {
  let L = 0;
  let U = 0;
  for (const e of st.g.cellEdges[c]) { const s = st.e[e]; if (s === 1) L++; else if (s === 0) U++; }
  return [L, U];
};
const vertCount = (st, v) => {
  let L = 0;
  let U = 0;
  for (const e of st.g.vertEdges[v]) { const s = st.e[e]; if (s === 1) L++; else if (s === 0) U++; }
  return [L, U];
};

/** Composantes des traits : { find, edges[root], verts[root], total, cycleRoot } */
function components(st) {
  const { g, e } = st;
  const parent = new Int16Array(g.V);
  for (let v = 0; v < g.V; v++) parent[v] = v;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let total = 0;
  for (let k = 0; k < g.E; k++) {
    if (e[k] !== 1) continue;
    total++;
    const a = find(g.edgeV[k * 2]);
    const b = find(g.edgeV[k * 2 + 1]);
    if (a !== b) parent[a] = b;
  }
  const edges = new Int16Array(g.V);
  const verts = new Int16Array(g.V);
  const seen = new Uint8Array(g.V);
  for (let k = 0; k < g.E; k++) {
    if (e[k] !== 1) continue;
    edges[find(g.edgeV[k * 2])]++;
    for (let j = 0; j < 2; j++) { const v = g.edgeV[k * 2 + j]; if (!seen[v]) { seen[v] = 1; verts[find(v)]++; } }
  }
  return { find, edges, verts, total };
}

/** Un chiffre est-il respecté si on ajoute l'arête k ? (toutes les cases chiffrées exactes) */
function cluesExactWith(st, k) {
  const { p, g } = st;
  for (let c = 0; c < p.N * p.N; c++) {
    if (p.clue[c] < 0) continue;
    let L = 0;
    for (const e of g.cellEdges[c]) if (st.e[e] === 1 || e === k) L++;
    if (L !== p.clue[c]) return false;
  }
  return true;
}

/**
 * Fermeture de boucle : { bad, cross: [arêtes à barrer], closed }.
 * bad : un cycle fermé existe alors qu'il reste d'autres traits.
 */
function loopRule(st) {
  const { g, e } = st;
  const comp = components(st);
  const out = { bad: false, cross: [], closed: false, cycles: [] };
  let cycleRoot = -1;
  for (let v = 0; v < g.V; v++) {
    if (comp.find(v) !== v || !comp.edges[v]) continue;
    if (comp.edges[v] === comp.verts[v]) {
      if (comp.edges[v] !== comp.total) { out.bad = true; return out; }
      cycleRoot = v;
    }
  }
  if (cycleRoot >= 0) {
    out.closed = true;
    for (let k = 0; k < g.E; k++) if (e[k] === 0) out.cross.push(k);
    return out;
  }
  for (let k = 0; k < g.E; k++) {
    if (e[k] !== 0) continue;
    const a = comp.find(g.edgeV[k * 2]);
    const b = comp.find(g.edgeV[k * 2 + 1]);
    if (a !== b || !comp.edges[a]) continue; // pas de fermeture
    const allowed = comp.edges[a] === comp.total && cluesExactWith(st, k);
    if (!allowed) out.cross.push(k);
  }
  return out;
}

/** Affectations possibles des arêtes d'une case chiffrée (avec contrôle des 4 sommets). */
function cellAssignments(st, c) {
  const { p, g, e } = st;
  const edges = g.cellEdges[c];
  const unk = edges.filter((k) => e[k] === 0);
  let lines = 0;
  for (const k of edges) if (e[k] === 1) lines++;
  const need = p.clue[c] - lines;
  const res = [];
  const local = new Map();
  for (let m = 0; m < 1 << unk.length; m++) {
    let cnt = 0;
    for (let b = 0; b < unk.length; b++) if (m & (1 << b)) cnt++;
    if (cnt !== need) continue;
    local.clear();
    unk.forEach((k, b) => local.set(k, m & (1 << b) ? 1 : 2));
    let ok = true;
    for (const v of g.cellVerts[c]) {
      let L = 0;
      let U = 0;
      for (const k of g.vertEdges[v]) {
        const s = local.get(k) ?? e[k];
        if (s === 1) L++; else if (s === 0) U++;
      }
      if (L > 2 || (L === 1 && U === 0)) { ok = false; break; }
    }
    if (ok) res.push(new Map(local));
  }
  return { unk, res };
}

const set = (st, k, v) => { st.e[k] = v; };

/** Propagation rapide jusqu'au point fixe. combo : ajoute les combinaisons par case. true si contradiction. */
function fastProp(st, combo) {
  const { p, g, e } = st;
  const NC = p.N * p.N;
  for (let guard = 0; guard < 2000; guard++) {
    let changed = false;
    for (let c = 0; c < NC; c++) {
      const cl = p.clue[c];
      if (cl < 0) continue;
      const [L, U] = cellCount(st, c);
      if (L > cl || L + U < cl) return true;
      if (U === 0) continue;
      if (L === cl) { for (const k of g.cellEdges[c]) if (e[k] === 0) set(st, k, 2); changed = true; }
      else if (L + U === cl) { for (const k of g.cellEdges[c]) if (e[k] === 0) set(st, k, 1); changed = true; }
    }
    for (let v = 0; v < g.V; v++) {
      const [L, U] = vertCount(st, v);
      if (L > 2) return true;
      if (L === 2) { if (U) { for (const k of g.vertEdges[v]) if (e[k] === 0) set(st, k, 2); changed = true; } }
      else if (L === 1) {
        if (U === 0) return true;
        if (U === 1) { for (const k of g.vertEdges[v]) if (e[k] === 0) set(st, k, 1); changed = true; }
      } else if (U === 1) { for (const k of g.vertEdges[v]) if (e[k] === 0) set(st, k, 2); changed = true; }
    }
    if (changed) continue;
    const lr = loopRule(st);
    if (lr.bad) return true;
    if (lr.cross.length) { for (const k of lr.cross) set(st, k, 2); continue; }
    if (combo) {
      for (let c = 0; c < NC && !changed; c++) {
        if (p.clue[c] < 0) continue;
        const { unk, res } = cellAssignments(st, c);
        if (!unk.length) continue;
        if (!res.length) return true;
        for (const k of unk) {
          const v0 = res[0].get(k);
          if (res.every((m) => m.get(k) === v0)) { set(st, k, v0); changed = true; }
        }
      }
      if (changed) continue;
    }
    // plus aucune inconnue : la solution doit être une seule boucle
    let unknown = false;
    for (let k = 0; k < g.E; k++) if (e[k] === 0) { unknown = true; break; }
    if (!unknown) {
      const comp = components(st);
      let cycles = 0;
      for (let v = 0; v < g.V; v++) if (comp.find(v) === v && comp.edges[v]) cycles++;
      return cycles !== 1 || comp.total === 0;
    }
    return false;
  }
  return false;
}

const complete = (st) => { for (let k = 0; k < st.g.E; k++) if (st.e[k] === 0) return false; return true; };

/** Une passe d'essais logiques : pour chaque arête inconnue, supposer un trait ou une croix. true si changement. */
function trialPass(st) {
  const { g } = st;
  let any = false;
  for (let k = 0; k < g.E; k++) {
    if (st.e[k] !== 0) continue;
    for (const v of [1, 2]) {
      const t = clone(st);
      t.e[k] = v;
      if (fastProp(t, true)) {
        st.e[k] = 3 - v;
        any = true;
        if (fastProp(st, true)) return true;
        break;
      }
    }
  }
  return any;
}

/** Résolvable avec les techniques jusqu'au niveau L ? */
export function solvable(p, L) {
  const st = newState(p);
  for (let guard = 0; guard < 400; guard++) {
    if (fastProp(st, L >= 2)) return false;
    if (complete(st)) return true;
    if (L < 3) return false;
    if (!trialPass(st)) return false;
  }
  return false;
}

// --- Techniques expliquées, une déduction à la fois (indices) ------------------------

function stepCells(st) {
  const { p, g, e } = st;
  for (let c = 0; c < p.N * p.N; c++) {
    const cl = p.clue[c];
    if (cl < 0) continue;
    const [L, U] = cellCount(st, c);
    if (!U) continue;
    if (L === cl) {
      return { tech: cl === 0 ? 'zero' : 'done', level: 1, cells: [c], changes: g.cellEdges[c].filter((k) => e[k] === 0).map((k) => [k, 2]) };
    }
    if (L + U === cl) return { tech: 'need', level: 1, cells: [c], changes: g.cellEdges[c].filter((k) => e[k] === 0).map((k) => [k, 1]) };
  }
  return null;
}
function stepVerts(st) {
  const { g, e } = st;
  for (let v = 0; v < g.V; v++) {
    const [L, U] = vertCount(st, v);
    const unk = g.vertEdges[v].filter((k) => e[k] === 0);
    if (L === 2 && U) return { tech: 'deg2', level: 1, verts: [v], changes: unk.map((k) => [k, 2]) };
    if (L === 1 && U === 1) return { tech: 'extend', level: 1, verts: [v], changes: unk.map((k) => [k, 1]) };
    if (L === 0 && U === 1) return { tech: 'end', level: 1, verts: [v], changes: unk.map((k) => [k, 2]) };
  }
  return null;
}
function stepLoop(st) {
  const lr = loopRule(st);
  if (lr.bad || !lr.cross.length) return null;
  const g = st.g;
  const k0 = lr.cross[0];
  return { tech: lr.closed ? 'closed' : 'loop', level: 1, verts: lr.closed ? [] : [g.edgeV[k0 * 2], g.edgeV[k0 * 2 + 1]], edges: [k0], changes: lr.cross.map((k) => [k, 2]) };
}
function stepCombo(st) {
  const { p, g } = st;
  for (let c = 0; c < p.N * p.N; c++) {
    if (p.clue[c] < 0) continue;
    const { unk, res } = cellAssignments(st, c);
    if (!unk.length || !res.length) continue;
    const changes = [];
    for (const k of unk) {
      const v0 = res[0].get(k);
      if (res.every((m) => m.get(k) === v0)) changes.push([k, v0]);
    }
    if (changes.length) return { tech: 'combo', level: 2, cells: [c], changes };
  }
  return null;
}
function stepTrial(st) {
  const { g } = st;
  for (let k = 0; k < g.E; k++) {
    if (st.e[k] !== 0) continue;
    for (const v of [1, 2]) {
      const t = clone(st);
      t.e[k] = v;
      if (fastProp(t, true)) return { tech: 'trial', level: 3, edges: [k], changes: [[k, 3 - v]] };
    }
  }
  return null;
}

/** Prochaine déduction de niveau <= maxLevel, la plus simple d'abord. */
export function findStep(st, maxLevel = 3) {
  let s = stepCells(st) || stepVerts(st) || stepLoop(st);
  if (s) return s;
  if (maxLevel >= 2 && (s = stepCombo(st))) return s;
  if (maxLevel >= 3 && (s = stepTrial(st))) return s;
  return null;
}

export const apply = (st, s) => { for (const [k, v] of s.changes) st.e[k] = v; };

/** Contradiction ou état incohérent ? */
export function broken(st) {
  const t = clone(st);
  return fastProp(t, false);
}

/** Les traits (1) forment-ils une seule boucle fermée (chiffres ignorés) ? */
export function isLoop(p, lines) {
  const g = geoOf(p.N);
  const st = { p, g, e: Int8Array.from(lines, (v) => (v === 1 ? 1 : 2)) };
  for (let v = 0; v < g.V; v++) {
    const [L] = vertCount(st, v);
    if (L !== 0 && L !== 2) return false;
  }
  const comp = components(st);
  if (!comp.total) return false;
  let roots = 0;
  for (let v = 0; v < g.V; v++) if (comp.find(v) === v && comp.edges[v]) roots++;
  return roots === 1;
}

/** Les arêtes (1 = trait) forment-elles une solution complète ? */
export function isSolution(p, lines) {
  if (!isLoop(p, lines)) return false;
  const g = geoOf(p.N);
  for (let c = 0; c < p.N * p.N; c++) {
    if (p.clue[c] < 0) continue;
    let L = 0;
    for (const k of g.cellEdges[c]) if (lines[k] === 1) L++;
    if (L !== p.clue[c]) return false;
  }
  return true;
}

/** Résout avec les techniques ; renvoie { solved, rating, counts, e }. */
export function solveWithTechniques(p, { maxLevel = 3 } = {}) {
  const st = newState(p);
  const counts = {};
  let rating = 0;
  for (let guard = 0; guard < 3000; guard++) {
    if (complete(st)) return { solved: isSolution(p, st.e), rating, counts, e: st.e };
    const s = findStep(st, maxLevel);
    if (!s) return { solved: false, rating, counts, e: st.e };
    counts[s.tech] = (counts[s.tech] || 0) + 1;
    rating = Math.max(rating, s.level);
    apply(st, s);
    if (broken(st)) return { solved: false, rating, counts, e: st.e };
  }
  return { solved: false, rating, counts, e: st.e };
}

/** Nombre de solutions (plafonné), première solution (Int8Array de 0/1) et toutes celles trouvées. */
export function countSolutions(p, limit = 2) {
  const g = geoOf(p.N);
  let count = 0;
  let first = null;
  const all = [];
  const rec = (st) => {
    if (count >= limit) return;
    // propagation, puis essais logiques tant qu'ils déduisent quelque chose (élague fortement)
    for (let guard = 0; guard < 400; guard++) {
      if (fastProp(st, true)) return;
      if (complete(st) || !trialPass(st)) break;
    }
    if (fastProp(st, true)) return;
    if (complete(st)) {
      count++;
      const sol = Int8Array.from(st.e, (v) => (v === 1 ? 1 : 0));
      if (!first) first = sol;
      all.push(sol);
      return;
    }
    // arête à essayer : voisine d'un trait ouvert, sinon voisine d'un chiffre
    let pick = -1;
    for (let v = 0; v < g.V && pick < 0; v++) {
      const [L, U] = vertCount(st, v);
      if (L === 1 && U >= 2) pick = g.vertEdges[v].find((k) => st.e[k] === 0);
    }
    if (pick < 0) {
      for (let c = 0; c < p.N * p.N && pick < 0; c++) {
        if (p.clue[c] < 0) continue;
        const k = g.cellEdges[c].find((x) => st.e[x] === 0);
        if (k != null) pick = k;
      }
    }
    if (pick < 0) pick = st.e.indexOf(0);
    for (const v of [1, 2]) {
      const t = clone(st);
      t.e[pick] = v;
      rec(t);
      if (count >= limit) return;
    }
  };
  rec(newState(p));
  return { count, sol: first, all };
}
