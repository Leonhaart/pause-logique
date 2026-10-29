import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/takuzu/bank.js';
import { generate, classify, SIZES } from '../js/games/takuzu/generator.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques, randomSolution, broken, findStep } from '../js/games/takuzu/solver.js';
import { randomTransform, applyTransform } from '../js/games/takuzu/transform.js';
import { createRng } from '../js/core/rng.js';

test('randomSolution : grille valide', () => {
  for (const N of SIZES) {
    const g = randomSolution(N, createRng('s' + N));
    assert.ok(g && !g.includes(-1) && !broken(g, N));
  }
});

test('techniques : paire, trou, quota', () => {
  const N = 6;
  const a = parsePuz('11....' + '.'.repeat(30));
  assert.deepEqual(findStep(a, N, 1).cells, [[2, 0]]);
  const b = parsePuz('1.1...' + '.'.repeat(30));
  assert.deepEqual(findStep(b, N, 1).cells, [[1, 0]]);
  const c = parsePuz('010.1.' + '.'.repeat(30)); // trois 0... non : 3 uns ? 0,1,0,.,1,. -> 1 deux fois, 0 deux fois
  assert.ok(!broken(c, N));
});

test('classification : chaque niveau existe à chaque taille', () => {
  for (const N of SIZES) {
    for (const level of ['easy', 'medium', 'hard']) {
      const g = generate(N, level, createRng(`t:${N}:${level}`), { maxTries: 200 });
      assert.ok(g, `${N} ${level}`);
      assert.equal(countSolutions(g.puz, N, 2).count, 1);
      assert.equal(classify(N, solveWithTechniques(g.puz, N)), level);
    }
  }
});

test('banque : 100 grilles par taille (25/50/25), uniques et bien classées', () => {
  for (const N of SIZES) {
    const seen = new Set();
    assert.deepEqual([BANK[N].easy.length, BANK[N].medium.length, BANK[N].hard.length], [25, 50, 25]);
    for (const level of Object.keys(BANK[N])) {
      for (const s of BANK[N][level]) {
        assert.equal(s.length, N * N);
        assert.ok(!seen.has(s));
        seen.add(s);
        const p = parsePuz(s);
        assert.equal(countSolutions(p, N, 2).count, 1);
        assert.equal(classify(N, solveWithTechniques(p, N)), level);
      }
    }
  }
});

test('transformation : la solution transformée reste valide et unique', () => {
  const N = 8;
  const rng = createRng('tf');
  for (let k = 0; k < 20; k++) {
    const p = parsePuz(BANK[N].medium[k]);
    const q = applyTransform(p, N, randomTransform(rng));
    assert.equal(q.filter((v) => v >= 0).length, p.filter((v) => v >= 0).length);
    const r = countSolutions(q, N, 2);
    assert.equal(r.count, 1);
    assert.ok(!broken(r.sol, N));
    assert.equal(formatPuz(q).length, N * N);
  }
});
