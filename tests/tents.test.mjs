import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/tents/bank.js';
import { generate, classify, SIZES } from '../js/games/tents/generator.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques, randomConfig, isSolution, newState, findStep } from '../js/games/tents/solver.js';
import { randomTransform, applyTransform } from '../js/games/tents/transform.js';
import { createRng } from '../js/core/rng.js';

test('randomConfig : la solution générée est valide', () => {
  for (const N of SIZES) {
    const cfg = randomConfig(N, [7, 12, 19][SIZES.indexOf(N)], createRng('c' + N));
    assert.ok(cfg);
    assert.ok(isSolution(Int8Array.from(cfg.sol, (v) => (v === 1 ? 1 : v === 2 ? 2 : 0)), cfg.puz));
  }
});

test('format : aller-retour', () => {
  for (const N of SIZES) for (const s of BANK[N].medium.slice(0, 10)) assert.equal(formatPuz(parsePuz(s, N)), s);
});

test('les techniques sont justes : chaque déduction vaut dans toutes les solutions', () => {
  const rng = createRng('sound');
  for (const N of [6, 8]) {
    for (let k = 0; k < 60; k++) {
      const cfg = randomConfig(N, [7, 12][SIZES.indexOf(N)], rng);
      if (!cfg) continue;
      const c = countSolutions(cfg.puz, 5);
      if (!c.count) continue;
      const st = newState(cfg.puz);
      for (let g = 0; g < 400 && st.cs.includes(-1); g++) {
        const s = findStep(st, 5);
        if (!s || s.contra) break;
        for (const [i, v] of s.cells) {
          assert.ok(c.all.every((sl) => (sl[i] === 1 ? 1 : 0) === v), `déduction ${s.tech} fausse`);
          st.cs[i] = v;
        }
      }
    }
  }
});

test('classification : chaque niveau existe à chaque taille', () => {
  for (const N of SIZES) {
    for (const level of ['easy', 'medium', 'hard']) {
      const g = generate(N, level, createRng(`t:${N}:${level}`), { maxTries: 50000 });
      assert.ok(g, `${N} ${level}`);
      assert.equal(countSolutions(g.puz, 2).count, 1);
      assert.equal(classify(N, solveWithTechniques(g.puz)), level);
    }
  }
});

test('banque : 100 grilles par taille (25/50/25), uniques et bien classées', () => {
  for (const N of SIZES) {
    const seen = new Set();
    assert.deepEqual([BANK[N].easy.length, BANK[N].medium.length, BANK[N].hard.length], [25, 50, 25]);
    for (const level of Object.keys(BANK[N])) {
      for (const s of BANK[N][level]) {
        assert.ok(!seen.has(s));
        seen.add(s);
        const p = parsePuz(s, N);
        assert.equal(countSolutions(p, 2).count, 1);
        assert.equal(classify(N, solveWithTechniques(p)), level);
      }
    }
  }
});

test('transformation : la grille transformée garde une solution unique', () => {
  const rng = createRng('tf');
  for (const N of SIZES) {
    for (let k = 0; k < 12; k++) {
      const p = parsePuz(BANK[N].medium[k], N);
      const q = applyTransform(p, randomTransform(rng));
      assert.equal(q.tree.reduce((a, b) => a + b, 0), p.tree.reduce((a, b) => a + b, 0));
      const r = countSolutions(q, 2);
      assert.equal(r.count, 1);
      assert.ok(isSolution(r.sol, q));
    }
  }
});
