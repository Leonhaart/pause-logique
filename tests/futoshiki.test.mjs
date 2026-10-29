import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/futoshiki/bank.js';
import { generate, classify, SIZES } from '../js/games/futoshiki/generator.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques, randomLatin, isValid, nextPlacement, autoCandidates } from '../js/games/futoshiki/solver.js';
import { randomTransform, applyTransform } from '../js/games/futoshiki/transform.js';
import { createRng } from '../js/core/rng.js';

test('randomLatin : carré latin valide', () => {
  for (const N of SIZES) {
    const g = randomLatin(N, createRng('l' + N));
    const p = { N, giv: new Int8Array(N * N), rel: [] };
    assert.ok(isValid(g, p));
  }
});

test('format : aller-retour', () => {
  for (const N of SIZES) {
    for (const s of BANK[N].medium.slice(0, 10)) assert.equal(formatPuz(parsePuz(s, N)), s);
  }
});

test('classification : chaque niveau existe à chaque taille', () => {
  for (const N of SIZES) {
    for (const level of ['easy', 'medium', 'hard']) {
      let g = null;
      for (let k = 0; k < 8 && !g; k++) g = generate(N, level, createRng(`t:${N}:${level}:${k}`), { maxTries: 300 });
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
        assert.ok(p.giv.some((d) => d > 0), 'au moins un chiffre donné');
        assert.equal(countSolutions(p, 2).count, 1);
        assert.equal(classify(N, solveWithTechniques(p)), level);
      }
    }
  }
});

test('transformation : la grille transformée reste unique et de même taille de contraintes', () => {
  const rng = createRng('tf');
  for (const N of SIZES) {
    for (let k = 0; k < 12; k++) {
      const p = parsePuz(BANK[N].medium[k], N);
      const q = applyTransform(p, randomTransform(rng));
      assert.equal(q.rel.length, p.rel.length);
      assert.equal(q.giv.filter((d) => d).length, p.giv.filter((d) => d).length);
      const r = countSolutions(q, 2);
      assert.equal(r.count, 1);
      assert.ok(isValid(r.sol, q));
    }
  }
});

test('indice : un chiffre déductible est juste', () => {
  for (const N of SIZES) {
    const p = parsePuz(BANK[N].hard[0], N);
    const sol = countSolutions(p, 1).sol;
    const f = nextPlacement(p, p.giv);
    assert.ok(f);
    assert.equal(f.digit, sol[f.cell]);
    const c = autoCandidates(p, p.giv);
    for (let i = 0; i < N * N; i++) assert.ok(c[i] & (1 << (sol[i] - 1)), 'la solution reste candidate');
  }
});
