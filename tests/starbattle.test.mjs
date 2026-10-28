import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/starbattle/bank.js';
import { parseReg, parseSol, countSolutions, solveWithTechniques, newState, place, findStep, geo } from '../js/games/starbattle/solver.js';
import { generate, classify, SIZES } from '../js/games/starbattle/generator.js';
import { randomTransform, applyTransform } from '../js/games/starbattle/transform.js';
import { createRng } from '../js/core/rng.js';
import { pick, consume, byId, bankSize } from '../js/games/starbattle/pool.js';
import { parseLevel, makeLevel, sizesOf, levelKeys } from '../js/games/registry.js';

const valid = (reg, N, sol) => {
  const cols = new Set(sol);
  const regs = new Set(sol.map((c, r) => reg[r * N + c]));
  if (cols.size !== N || regs.size !== N) return false;
  for (let r = 1; r < N; r++) if (Math.abs(sol[r] - sol[r - 1]) <= 1) return false;
  return true;
};

test('banque : 100 grilles par taille, répartition 25/50/25', () => {
  for (const N of SIZES) {
    assert.deepEqual(Object.fromEntries(Object.entries(BANK[N]).map(([k, v]) => [k, v.length])), { easy: 25, medium: 50, hard: 25 });
  }
});

test('banque : solution valide, unique, niveau annoncé', () => {
  for (const N of SIZES) {
    const seen = new Set();
    for (const [level, list] of Object.entries(BANK[N])) {
      list.forEach(([r, s], k) => {
        const reg = parseReg(r);
        const sol = parseSol(s);
        assert.equal(reg.length, N * N);
        assert.ok(valid(reg, N, sol), `${N} ${level} #${k} solution invalide`);
        assert.equal(countSolutions(reg, N, 2), 1, `${N} ${level} #${k} non unique`);
        assert.ok(!seen.has(r), 'doublon');
        seen.add(r);
        if (k % 5 === 0) assert.equal(classify(N, solveWithTechniques(reg, N)), level, `${N} ${level} #${k} niveau`);
      });
    }
  }
});

test('régions : N régions connexes', () => {
  for (const N of SIZES) {
    for (const [r] of BANK[N].medium.slice(0, 10)) {
      const reg = parseReg(r);
      assert.equal(new Set(reg).size, N);
      for (let g = 0; g < N; g++) {
        const cells = [...reg.keys()].filter((i) => reg[i] === g);
        const seen = new Set([cells[0]]);
        const stack = [cells[0]];
        while (stack.length) {
          const x = stack.pop();
          for (const j of [x - N, x + N, x % N ? x - 1 : -1, (x + 1) % N ? x + 1 : -1]) {
            if (j >= 0 && j < N * N && reg[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
          }
        }
        assert.equal(seen.size, cells.length, `région ${g} non connexe`);
      }
    }
  }
});

test('générateur : grille unique pour chaque difficulté', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const g = generate(8, level, createRng('t-' + level));
    assert.ok(g);
    assert.equal(countSolutions(g.reg, 8, 2), 1);
    assert.equal(classify(8, solveWithTechniques(g.reg, 8)), level);
  }
});

test('transformation : règles, unicité et solution conservées', () => {
  const rng = createRng('tf');
  for (const N of SIZES) {
    const [r, s] = BANK[N].easy[3];
    for (let k = 0; k < 8; k++) {
      const { reg, sol } = applyTransform(parseReg(r), parseSol(s), N, randomTransform(rng, N));
      assert.ok(valid(reg, N, sol));
      assert.equal(countSolutions(reg, N, 2), 1);
    }
  }
});

test('moteur : une étoile posée élimine ligne, colonne, région et voisines', () => {
  const [r, s] = BANK[8].easy[0];
  const reg = parseReg(r);
  const sol = parseSol(s);
  const st = newState(reg, 8);
  const { neigh } = geo(8);
  const i = sol[3] + 3 * 8;
  place(st, i);
  assert.equal(st.cs[i], 2);
  for (const nb of neigh[i]) assert.equal(st.cs[nb], 0);
  for (let c = 0; c < 8; c++) if (c !== sol[3]) assert.equal(st.cs[3 * 8 + c], 0);
});

test('moteur : toutes les déductions sont justes (jamais d’élimination d’une étoile de la solution)', () => {
  for (const N of SIZES) {
    for (const level of ['easy', 'medium', 'hard']) {
      const [r, s] = BANK[N][level][1];
      const reg = parseReg(r);
      const sol = parseSol(s);
      const st = newState(reg, N);
      for (let g = 0; g < 400 && st.stars < N; g++) {
        const step = findStep(st, 5);
        assert.ok(step, `${N} ${level} bloqué`);
        if (step.place != null) {
          assert.equal(sol[(step.place / N) | 0], step.place % N);
          place(st, step.place);
        } else {
          for (const c of step.elim) {
            assert.notEqual(sol[(c / N) | 0], c % N, 'étoile éliminée à tort');
            st.cs[c] = 0;
          }
        }
      }
      assert.equal(st.stars, N);
    }
  }
});

test('stock : tirage, consommation, grilles non rejouées', () => {
  const rng = createRng('pool');
  const N = 8;
  const seen = new Set();
  for (let k = 0; k < bankSize(N, 'hard'); k++) {
    const g = pick(N, 'hard', rng);
    assert.ok(!seen.has(g.pid), 'grille déjà jouée proposée');
    seen.add(g.pid);
    consume(N, 'hard', g.pid);
  }
  assert.equal(seen.size, 25);
  assert.ok(byId(N, 'hard', 'b0')); // la banque reste lisible
  assert.ok(pick(N, 'hard', rng)); // stock épuisé : on rejoue une grille plutôt que de bloquer
});

test('niveaux avec taille', () => {
  assert.deepEqual(parseLevel('hard-12'), { diff: 'hard', size: 12 });
  assert.deepEqual(parseLevel('easy'), { diff: 'easy', size: null });
  assert.equal(makeLevel('medium', 10), 'medium-10');
  assert.deepEqual(sizesOf('starbattle'), [8, 10, 12]);
  assert.equal(sizesOf('sudoku'), null);
  assert.equal(levelKeys('starbattle').length, 9);
  assert.equal(levelKeys('sudoku').length, 3);
});
