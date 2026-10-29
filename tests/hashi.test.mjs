import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/hashi/bank.js';
import { generate, SIZES, rate, levelOf } from '../js/games/hashi/generator.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques, randomConfig, isSolution, newState, findStep } from '../js/games/hashi/solver.js';
import { randomTransform, applyTransform } from '../js/games/hashi/transform.js';
import { createRng } from '../js/core/rng.js';

test('randomConfig : la solution générée est valide', () => {
  for (const N of SIZES) {
    for (let k = 0; k < 20; k++) {
      const cfg = randomConfig(N, [12, 20, 30][SIZES.indexOf(N)], 0.3, createRng(`c${N}${k}`));
      if (cfg) assert.ok(isSolution(cfg.puz, cfg.sol));
    }
  }
});

test('format : aller-retour', () => {
  for (const N of SIZES) for (const s of BANK[N].medium.slice(0, 10)) assert.equal(formatPuz(parsePuz(s, N)), s);
});

test('les techniques sont justes : chaque déduction vaut dans toutes les solutions', () => {
  const rng = createRng('sound');
  let checked = 0;
  for (const N of [7, 9]) {
    for (let k = 0; k < 120; k++) {
      const cfg = randomConfig(N, N === 7 ? 9 : 14, 0.3, rng);
      if (!cfg) continue;
      const c = countSolutions(cfg.puz, 50);
      if (!c.count) continue;
      const st = newState(cfg.puz);
      for (let g = 0; g < 400; g++) {
        const s = findStep(st, 4);
        if (!s) break;
        for (const [x, m] of s.changes) {
          for (const sl of c.all) assert.ok(m & (1 << sl[x]), `déduction ${s.tech} fausse`);
          st.dom[x] = m;
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 50);
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
      assert.equal(q.num.reduce((a, b) => a + b, 0), p.num.reduce((a, b) => a + b, 0));
      const r = countSolutions(q, 2);
      assert.equal(r.count, 1);
      assert.ok(isSolution(q, r.sol));
    }
  }
});
