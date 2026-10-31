// Takuzu : interface. Autant de 0 que de 1 par ligne et colonne, jamais trois identiques à la suite,
// aucune ligne ni colonne en double. ● = 1, ○ = 0.
import { h } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { geo, allSteps } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 8;
    const NN = N * N;
    const { lineCells } = geo(N);
    const saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const given = (i) => puz[i] >= 0;

    // marks : -1 vide, 0, 1 (les cases données sont reprises de puz)
    const marks = Int8Array.from(puz);
    const snapshot = () => Array.from(marks, (v) => (v < 0 ? '.' : v)).join('');
    const load = (snap) => { for (let i = 0; i < NN; i++) marks[i] = snap[i] === '.' ? -1 : +snap[i]; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let wrong = new Set();
    let hint = null; // { step, revealed }
    let message = null;
    let finished = false;
    let sel = -1;

    // --- DOM --------------------------------------------------------------
    const cells = [];
    const board = h('div', { class: 'tk-board', role: 'grid', 'aria-label': t('game.takuzu.name') });
    board.style.setProperty('--n', N);
    for (let i = 0; i < NN; i++) {
      const el = h('div', { class: 'tk-cell', role: 'gridcell', dataset: { i } }, h('span', { class: 'tk-mark' }));
      board.append(el);
      cells.push(el);
    }
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });
    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const root = h('div', { class: 'tk' }, h('div', { class: 'tk-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)));
    container.append(root);

    // --- historique -------------------------------------------------------
    const persist = () => ctx.save({ ...hist.dump(), pid });
    function reset() { wrong = new Set(); hint = null; message = null; }
    function commit() {
      reset();
      if (hist.commit(snapshot())) persist();
      render();
      checkComplete();
    }
    function undo() { const s = hist.undo(); if (s == null) return; load(s); reset(); persist(); render(); }
    function redo() { const s = hist.redo(); if (s == null) return; load(s); reset(); persist(); render(); }

    // --- vérification et fin ----------------------------------------------
    const isWrong = (i) => marks[i] >= 0 && marks[i] !== sol[i];
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < NN; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('tk.noErrors') : wrong.size === 1 ? t('tk.errorFound') : t('tk.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished || marks.includes(-1)) return;
      if (marks.some((v, i) => v !== sol[i])) {
        message = { text: t('tk.fullButWrong') };
        return render();
      }
      finished = true;
      render();
      consume(N, diff, pid);
      ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
    }

    // --- indices ----------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('tk.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les cases justes du joueur.
      const g = Int8Array.from(marks, (v, i) => (v === sol[i] ? v : -1));
      const rcOf = (i) => [Math.floor(i / N), i % N];
      const plan = g.includes(-1) ? planHint({
        collect: () => allSteps(g, N, 5),
        apply: (st) => { if (!st.contra) for (const [i, v] of st.cells) g[i] = v; },
        fresh: (st) => (st.contra ? [] : st.cells.filter(([i]) => g[i] < 0)),
        where: (st, f) => f.map(([i]) => rcOf(i)),
        last: sel >= 0 ? rcOf(sel) : null,
      }) : null;
      let step = plan ? { ...plan.step, cells: plan.fresh, prior: plan.prior } : null;
      if (!step) {
        const cand = [...Array(NN).keys()].filter((k) => marks[k] !== sol[k]);
        if (!cand.length) return;
        if (sel >= 0) cand.sort((x, y) => manhattan(rcOf(x), rcOf(sel)) - manhattan(rcOf(y), rcOf(sel)));
        step = { tech: 'search', cells: [[cand[0], sol[cand[0]]]], units: [], prior: [] };
      }
      hint = { step, revealed: false };
      showHint();
    }
    const SYM = (v) => (v === 1 ? '●' : '○');
    /** Cases de la ligne/colonne (ou du triplet) en cause dans l'impasse. */
    function failCellsOf(f) {
      if (!f) return [];
      if (f.kind === 'three') return f.cells;
      const { lineCells } = geo(N);
      const us = f.kind === 'dup' ? [f.u, f.u2] : [f.u];
      return us.flatMap((u) => lineCells[u]);
    }
    const unitLabel = (u) => (u < N ? t('tk.u.row', { n: u + 1 }) : t('tk.u.col', { n: u - N + 1 }));
    /** Paramètres concrets : ligne/colonne, symboles, positions le long de la ligne. */
    function explain(s) {
      const [ti, tv] = s.cells[0];
      const p = { r: Math.floor(ti / N) + 1, c: (ti % N) + 1, v: SYM(tv), o: SYM(1 - tv), n: N / 2, k: s.cells.length };
      if (s.units?.length) {
        const u = s.units[0];
        p.unit = u < N ? t('tk.u.row', { n: u + 1 }) : t('tk.u.col', { n: u - N + 1 });
        p.line = u < N ? t('tk.u.rowNoun') : t('tk.u.colNoun');
        p.at = (i) => (u < N ? (i % N) + 1 : Math.floor(i / N) + 1);
        p.target = p.at(ti);
        if (s.focus) p.pos = s.focus.map(p.at).join(', ');
        delete p.at;
      }
      if (s.tech === 'trial' && s.why) {
        const w = s.why;
        p.hs = SYM(w.hyp[1]);
        p.rx = Math.floor(w.hyp[0] / N) + 1;
        p.cx = (w.hyp[0] % N) + 1;
        p.n = w.ghost.length;
        const f = w.fail;
        p.fail = f ? t(`tk.fail.${f.kind}`, { unit: unitLabel(f.u ?? 0), unit2: f.u2 != null ? unitLabel(f.u2) : '', sym: SYM(f.sym ?? 1), n: N / 2 }) : '';
      }
      return p;
    }
    function showHint() {
      const s = hint.step;
      if (hint.revealed) {
        message = {
          text: s.cells.length === 1 ? t('tk.hint.revealOne', { v: s.cells[0][1] }) : t('tk.hint.revealMany'),
          action: { label: t('tk.hint.place'), run: () => { for (const [i, v] of s.cells) marks[i] = v; commit(); } },
        };
      } else {
        let text = t(s.tech === 'trial' && s.why?.ghost?.length ? 'tk.hint.trialChain' : `tk.hint.${s.tech}`, explain(s));
        const names = [...new Set((s.prior ?? []).filter((x) => x !== s.tech))].map((x) => t(`tk.prior.${x}`));
        if (names.length) text += ' ' + t('tk.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('tk.hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie : appui = cycle vide, ●, ○ ; glisser = peindre -----------------
    const cellAt = (e) => {
      const rect = board.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
      return r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1;
    };
    const nextVal = (v) => (v < 0 ? 1 : v === 1 ? 0 : -1);
    let drag = null;
    board.addEventListener('pointerdown', (e) => {
      if (finished || e.button > 0) return;
      const i = cellAt(e);
      if (i < 0) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      sel = i;
      drag = given(i) ? { start: i, last: i, value: null, from: null, moved: false, changed: false } : { start: i, last: i, value: nextVal(marks[i]), from: marks[i], moved: false, changed: false };
      render();
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const i = cellAt(e);
      if (i < 0 || i === drag.last) return;
      drag.last = i;
      if (drag.value === null) return;
      const paint = (k) => {
        if (given(k)) return;
        if (drag.value >= 0 && marks[k] < 0) { marks[k] = drag.value; drag.changed = true; }
        else if (drag.value < 0 && marks[k] === drag.from) { marks[k] = -1; drag.changed = true; }
      };
      if (!drag.moved) { drag.moved = true; paint(drag.start); }
      paint(i);
      render();
    });
    board.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.value === null) return render();
      if (!d.moved) { marks[d.start] = d.value; commit(); }
      else if (d.changed) commit();
      else render();
    });
    board.addEventListener('pointercancel', () => { drag = null; render(); });

    // --- rendu ------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const s = hint?.step;
      const lineSet = new Set();
      const focusSet = new Set();
      const targetSet = new Set();
      if (s && !hint.revealed) {
        for (const u of s.units ?? []) for (const c of lineCells[u]) lineSet.add(c);
        for (const c of s.focus ?? []) focusSet.add(c);
        if (s.tech === 'search') for (const [i] of s.cells) targetSet.add(i);
      }
      const why = s && !hint.revealed && s.tech === 'trial' ? s.why : null;
      const ghostMap = new Map((why?.ghost ?? []).map(([i, v]) => [i, v]));
      const failSet = new Set(why ? failCellsOf(why.fail) : []);
      const revealSet = s && hint.revealed ? new Set(s.cells.map(([i]) => i)) : null;
      const names = [t('tk.zero'), t('tk.one')];
      for (let i = 0; i < NN; i++) {
        const v = marks[i];
        const cls = ['tk-cell'];
        if (given(i)) cls.push('given');
        if (v === 1) cls.push('v1');
        else if (v === 0) cls.push('v0');
        if (!given(i) && ((mode === 'live' && isWrong(i)) || wrong.has(i))) cls.push('bad');
        if (lineSet.has(i)) cls.push('hint-unit');
        if (focusSet.has(i)) cls.push('hint-focus');
        if (targetSet.has(i) || (revealSet && revealSet.has(i))) cls.push('hint-cell');
        cells[i].dataset.g = '';
        if (why) {
          if (i === why.hyp[0]) { cls.push('hint-hyp'); cells[i].dataset.g = SYM(why.hyp[1]); }
          else if (ghostMap.has(i)) { cls.push('hint-ghost'); cells[i].dataset.g = SYM(ghostMap.get(i)); }
          if (failSet.has(i)) cls.push('hint-fail');
        }
        if (i === sel && !finished) cls.push('sel');
        cells[i].className = cls.join(' ');
        cells[i].setAttribute('aria-label', t('tk.cellAria', { r: Math.floor(i / N) + 1, c: (i % N) + 1 }) + ', ' + (v < 0 ? t('tk.empty') : names[v]));
      }
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      msgEl.replaceChildren();
      if (message) {
        msgEl.append(h('span', {}, message.text));
        if (message.action) msgEl.append(h('button', { class: 'btn', onClick: message.action.run }, message.action.label));
      }
    }

    // --- clavier ----------------------------------------------------------
    function onKey(e) {
      if (document.querySelector('.sheet-backdrop') || e.metaKey || e.altKey) return;
      const k = e.key;
      if (e.ctrlKey && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.ctrlKey && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (e.ctrlKey || finished) return;
      const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      if (move) {
        e.preventDefault();
        const from = sel < 0 ? 0 : sel;
        const r = Math.min(N - 1, Math.max(0, Math.floor(from / N) + move[0]));
        const c = Math.min(N - 1, Math.max(0, (from % N) + move[1]));
        sel = r * N + c;
        return render();
      }
      if (sel < 0 || given(sel)) return;
      if (k === '0' || k === '1') { marks[sel] = marks[sel] === +k ? -1 : +k; return commit(); }
      if (k === ' ' || k === 'Enter') { e.preventDefault(); marks[sel] = nextVal(marks[sel]); return commit(); }
      if (k === 'Backspace' || k === 'Delete') { marks[sel] = -1; return commit(); }
    }
    document.addEventListener('keydown', onKey);
    const unsub = ctx.onSettings(() => render());

    render();
    refillAll();
    return {
      destroy() {
        document.removeEventListener('keydown', onKey);
        unsub();
        root.remove();
      },
    };
  },
};
