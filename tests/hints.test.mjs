import test from 'node:test';
import assert from 'node:assert/strict';
import { planHint, manhattan } from '../js/core/hint.js';
import { BANK as SD } from '../js/games/sudoku/bank.js';
import * as sud from '../js/games/sudoku/solver.js';

test('planHint : la plus facile d’abord, puis la plus proche', () => {
  const steps = [
    { tech: 'a', level: 2, at: [0, 0] },
    { tech: 'b', level: 1, at: [8, 8] },
    { tech: 'c', level: 1, at: [4, 0] },
  ];
  const mk = (last) => planHint({ collect: () => steps, apply() {}, fresh: () => [1], where: (s) => [s.at], last });
  assert.equal(mk([0, 0]).step.tech, 'c'); // niveau 1 d'abord, la plus proche de (0,0) est c
  assert.equal(mk([8, 7]).step.tech, 'b');
  assert.equal(manhattan([0, 0], [2, 3]), 5);
});

test('planHint : applique les déductions sans effet visible puis continue', () => {
  let state = 0;
  const plan = planHint({
    collect: () => (state === 0 ? [{ tech: 'elim', level: 1 }] : [{ tech: 'place', level: 2, at: [1, 1] }]),
    apply: () => { state = 1; },
    fresh: (s) => (s.tech === 'place' ? [1] : []),
    where: (s) => [s.at],
    last: [0, 0],
  });
  assert.equal(plan.step.tech, 'place');
  assert.deepEqual(plan.prior, ['elim']);
});

test('sudoku : toutes les déductions énumérées sont justes, et l’indice varie selon la case touchée', () => {
  let varied = 0;
  for (const level of ['easy', 'medium']) {
    for (const [puzzle, solution] of SD[level].slice(0, 6)) {
      const g = sud.parse(puzzle);
      const sol = sud.parse(solution);
      const st = sud.initState(g);
      const steps = sud.allSteps(st, 3);
      assert.ok(steps.length > 0);
      for (const s of steps) {
        if (s.place) assert.equal(sol[s.place.i], s.place.d, `placement faux (${s.tech})`);
        for (const e of s.elim ?? []) assert.equal(e.mask & (1 << (sol[e.i] - 1)), 0, `élimination fausse (${s.tech})`);
      }
      const places = steps.filter((s) => s.place);
      if (places.length >= 2) {
        const pick = (last) => planHint({ collect: () => sud.allSteps(sud.initState(g), 3), apply() {}, fresh: (s) => (s.place ? [s.place] : []), where: (s) => [[sud.ROW[s.place.i], sud.COL[s.place.i]]], last }).step.place.i;
        if (pick([0, 0]) !== pick([8, 8])) varied++;
        // la case choisie est bien la plus proche parmi les placements de même niveau
        const lvl = Math.min(...places.map((s) => s.level));
        const pool = places.filter((s) => s.level === lvl);
        const d = (i) => manhattan([sud.ROW[i], sud.COL[i]], [0, 0]);
        assert.equal(d(pick([0, 0])), Math.min(...pool.map((s) => d(s.place.i))));
      }
    }
  }
  assert.ok(varied >= 3, `variété : ${varied}`);
});

import { BANK as FU } from '../js/games/futoshiki/bank.js';
import * as fu from '../js/games/futoshiki/solver.js';

test('futoshiki : les placements d’indice sont justes et suivent la dernière case', () => {
  for (const N of [4, 5, 6]) {
    for (const level of ['easy', 'medium', 'hard']) {
      const p = fu.parsePuz(FU[N][level][0], N);
      const sol = fu.countSolutions(p, 1).sol;
      const g = Int8Array.from(p.giv);
      let last = null;
      for (let n = 0; n < N * N; n++) {
        const r = fu.planPlacement(p, g, last);
        if (!r) break;
        assert.equal(r.digit, sol[r.cell], `${N} ${level} case ${r.cell}`);
        assert.equal(g[r.cell], 0);
        g[r.cell] = r.digit;
        last = [Math.floor(r.cell / N), r.cell % N];
      }
      assert.ok(g.every((v, i) => v === sol[i]), `${N} ${level} complet`);
    }
  }
});
