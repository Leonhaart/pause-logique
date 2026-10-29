import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/akari/bank.js';
import { generate, SIZES, rate, levelOf } from '../js/games/akari/generator.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques, randomConfig, isSolution, newState, findStep } from '../js/games/akari/solver.js';
import { randomTransform, applyTransform } from '../js/games/akari/transform.js';
import { createRng } from '../js/core/rng.js';

test('randomConfig : la solution générée est valide', () => {
  for (const N of SIZES) {
    const cfg = randomConfig(N, 0.3, createRng('c' + N));
    assert.ok(cfg);
    assert.ok(isSolution(cfg.puz, cfg.sol));
  }
});

test('format : aller-retour', () => {
  for (const N of SIZES) for (const s of BANK[N].medium.slice(0, 10)) assert.equal(formatPuz(parsePuz(s, N)), s);
});

test('les techniques sont justes : chaque déduction vaut dans toutes les solutions', () => {
  const rng = createRng('sound');
  for (const N of [7, 9]) {
    for (let k = 0; k < 80; k++) {
      const cfg = randomConfig(N, 0.2 + 0.15 * rng.next(), rng);
      if (!cfg) continue;
      // retire des chiffres au hasard pour obtenir des grilles à plusieurs solutions
      for (let i = 0; i < N * N; i++) if (cfg.puz.wall[i] && rng.next() < 0.6) cfg.puz.num[i] = -1;
      const c = countSolutions(cfg.puz, 200);
      if (!c.count || c.count >= 200) continue;
      const st = newState(cfg.puz);
      for (let g = 0; g < 400 && st.cs.includes(-1); g++) {
        const s = findStep(st, 4);
        if (!s) break;
        for (const [i, v] of s.cells) {
          assert.ok(c.all.every((sl) => sl[i] === v), `déduction ${s.tech} fausse`);
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
      const p = parsePuz(g.puz, N);
      assert.equal(countSolutions(p, 2).count, 1);
      assert.equal(levelOf(rate(p)), level);
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
        assert.equal(levelOf(rate(p)), level);
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
      assert.equal(q.wall.reduce((a, b) => a + b, 0), p.wall.reduce((a, b) => a + b, 0));
      const r = countSolutions(q, 2);
      assert.equal(r.count, 1);
      assert.ok(isSolution(q, r.sol));
    }
  }
});
