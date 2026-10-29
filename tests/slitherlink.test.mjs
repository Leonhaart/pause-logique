import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/slitherlink/bank.js';
import { generate, SIZES, rate, levelOf, randomLoop } from '../js/games/slitherlink/generator.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques, isSolution, isLoop, newState, findStep, apply, geoOf } from '../js/games/slitherlink/solver.js';
import { applyTransform } from '../js/games/slitherlink/transform.js';
import { createRng } from '../js/core/rng.js';

/** Arêtes de la frontière d'une région intérieure. */
function boundary(N, inside) {
  const g = geoOf(N);
  const at = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? inside[r * N + c] : 0);
  const lines = new Int8Array(g.E);
  for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) lines[g.hEdge(r, c)] = at(r - 1, c) !== at(r, c) ? 1 : 0;
  for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) lines[g.vEdge(r, c)] = at(r, c - 1) !== at(r, c) ? 1 : 0;
  return lines;
}

test('format : aller-retour', () => {
  for (const N of SIZES) for (const s of BANK[N].medium.slice(0, 10)) assert.equal(formatPuz(parsePuz(s, N)), s);
});

test('boucles aléatoires : le contour est une seule boucle', () => {
  const rng = createRng('loops');
  for (const N of [5, 7, 10]) {
    for (let k = 0; k < 20; k++) {
      const inside = randomLoop(N, rng, 0.5);
      assert.ok(isLoop({ N, clue: new Int8Array(N * N).fill(-1) }, boundary(N, inside)), `${N} #${k}`);
    }
  }
});

test('les techniques sont justes : chaque déduction vaut dans toutes les solutions', () => {
  const rng = createRng('sound');
  let tested = 0;
  for (let k = 0; k < 120 && tested < 30; k++) {
    const N = 4 + (k % 2);
    const inside = randomLoop(N, rng, 0.55);
    const lines = boundary(N, inside);
    const g = geoOf(N);
    const clue = new Int8Array(N * N);
    for (let c = 0; c < N * N; c++) {
      let n = 0;
      for (const e of g.cellEdges[c]) n += lines[e];
      clue[c] = rng.next() < 0.45 ? n : -1;
    }
    const p = { N, clue };
    const c = countSolutions(p, 400);
    if (!c.count || c.count >= 400) continue;
    tested++;
    assert.ok(c.all.every((sl) => isSolution(p, sl)));
    const st = newState(p);
    for (let guard = 0; guard < 300; guard++) {
      const s = findStep(st, 3);
      if (!s) break;
      for (const [e, v] of s.changes) assert.ok(c.all.every((sl) => (sl[e] === 1) === (v === 1)), `déduction ${s.tech} fausse`);
      apply(st, s);
    }
  }
  assert.ok(tested >= 10);
});

test('classification : chaque niveau existe à chaque taille', () => {
  for (const N of SIZES) {
    for (const level of ['easy', 'medium', 'hard']) {
      const g = generate(N, level, createRng(`t:${N}:${level}`), { maxTries: 50000 });
      assert.ok(g, `${N} ${level}`);
      const p = parsePuz(g.puz, N);
      assert.equal(countSolutions(p, 2).count, 1);
      assert.equal(levelOf(rate(p)), level);
    }
  }
});

test('banque : 100 grilles par taille (25/50/25), uniques et bien classées', () => {
  for (const N of SIZES) {
    const seen = new Set();
    for (const level of ['easy', 'medium', 'hard']) {
      assert.equal(BANK[N][level].length, { easy: 25, medium: 50, hard: 25 }[level], `${N} ${level}`);
      for (const s of BANK[N][level]) {
        assert.ok(!seen.has(s));
        seen.add(s);
        const p = parsePuz(s, N);
        assert.equal(countSolutions(p, 2).count, 1);
        const r = solveWithTechniques(p);
        assert.ok(r.solved);
        assert.equal(levelOf(r.rating), level);
      }
    }
  }
});

test('transformation : les 8 variantes gardent une solution unique', () => {
  for (const N of SIZES) {
    const p = parsePuz(BANK[N].medium[0], N);
    const seen = new Set();
    for (let rot = 0; rot < 4; rot++) {
      for (const flip of [false, true]) {
        const q = applyTransform(p, { rot, flip });
        seen.add(formatPuz(q));
        const r = countSolutions(q, 2);
        assert.equal(r.count, 1);
        assert.ok(isSolution(q, r.sol));
        assert.equal(q.clue.filter((v) => v >= 0).length, p.clue.filter((v) => v >= 0).length);
      }
    }
    assert.ok(seen.size >= 2);
  }
});
