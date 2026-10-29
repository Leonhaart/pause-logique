import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/kakuro/bank.js';
import { generate, SIZES, rate, levelOf } from '../js/games/kakuro/generator.js';
import {
  parsePuz, formatPuz, countSolutions, solveWithTechniques, isSolution, newState, findStep,
  randomLayout, randomFill, withSums, autoCandidates, geoOf,
} from '../js/games/kakuro/solver.js';
import { randomTransform, applyTransform } from '../js/games/kakuro/transform.js';
import { createRng } from '../js/core/rng.js';

const popcnt = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };

test('format : aller-retour', () => {
  for (const N of SIZES) for (const s of BANK[N].medium.slice(0, 10)) assert.equal(formatPuz(parsePuz(s, N)), s);
});

test('les techniques sont justes : chaque déduction vaut dans toutes les solutions', () => {
  const rng = createRng('sound');
  let tested = 0;
  for (const N of [5, 6]) {
    for (let k = 0; k < 150 && tested < 40; k++) {
      const white = randomLayout(N, 0.7, rng);
      if (!white) continue;
      const vals = randomFill({ N, white, down: new Int8Array(N * N), right: new Int8Array(N * N), given: new Int8Array(N * N) }, rng);
      if (!vals) continue;
      const p = withSums(N, white, vals);
      const c = countSolutions(p, 300);
      if (!c.count || c.count >= 300) continue;
      tested++;
      assert.ok(c.all.every((sl) => isSolution(p, sl)));
      const st = newState(p);
      for (let g = 0; g < 400; g++) {
        const s = findStep(st, 4);
        if (!s) break;
        for (const [i, m] of s.changes) {
          assert.ok(c.all.every((sl) => m & (1 << (sl[i] - 1))), `déduction ${s.tech} fausse`);
          st.cand[i] = m;
        }
      }
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

test('transformation : la grille transformée garde une solution unique', () => {
  const rng = createRng('tf');
  for (const N of SIZES) {
    for (let k = 0; k < 12; k++) {
      const p = parsePuz(BANK[N].medium[k], N);
      const q = applyTransform(p, { transpose: true });
      const r = countSolutions(q, 2);
      assert.equal(r.count, 1);
      assert.ok(isSolution(q, r.sol));
      assert.equal(applyTransform(q, { transpose: true }).down.join(), p.down.join());
      assert.ok(applyTransform(p, randomTransform(rng)));
    }
  }
});

test('notes automatiques : la vraie solution est toujours permise', () => {
  for (const N of SIZES) {
    const p = parsePuz(BANK[N].hard[0], N);
    const sol = countSolutions(p, 1).sol;
    const c = autoCandidates(p, new Int8Array(N * N));
    for (const i of geoOf(p).whites) {
      assert.ok(c[i] & (1 << (sol[i] - 1)));
      assert.ok(popcnt(c[i]) >= 1);
    }
  }
});
