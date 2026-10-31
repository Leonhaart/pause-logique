// Tents : interface. Une tente à côté de chaque arbre, jamais deux tentes voisines (diagonale comprise),
// chiffres = tentes par ligne et colonne.
import { h, svgEl } from '../../core/dom.js';
import { storage } from '../../core/storage.js';
import { History, toolButton } from '../../ui/kit.js';
import { geo, newState, allSteps } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const TREE = '<svg viewBox="0 0 24 24" class="te-tree" aria-hidden="true"><path d="M12 2.500l5.500 7.500h-3.200l4.700 6.500H5l4.700-6.500H6.500z"/><rect x="10.600" y="16.500" width="2.800" height="4.500" rx="0.600"/></svg>';
const TENT = '<svg viewBox="0 0 24 24" class="te-tent" aria-hidden="true"><path d="M12 4L2.500 19.500h19z"/><path class="te-door" d="M12 11.500l-3.300 8h6.600z"/></svg>';

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 8;
    const NN = N * N;
    const { n4, n8, lines } = geo(N);
    const saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const isTree = (i) => puz.tree[i] === 1;
    const isTent = (i) => sol[i] === 1;
    const row = (i) => Math.floor(i / N);
    const col = (i) => i % N;

    // marks : 0 vide, 1 tente, 2 herbe posée à la main
    const marks = new Uint8Array(NN);
    const snapshot = () => Array.from(marks).join('');
    const load = (snap) => { for (let i = 0; i < NN; i++) marks[i] = +snap[i]; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let autoGrass = storage.get('te:autoGrass', true);
    let tentFirst = storage.get('te:tentFirst', false);
    let wrong = new Set();
    let hint = null;
    let message = null;
    let finished = false;
    let sel = -1;

    // --- DOM : N colonnes + une colonne de comptes, une ligne de comptes en haut ---
    const board = h('div', { class: 'te-board', role: 'grid', 'aria-label': t('game.tents.name') });
    board.style.setProperty('--n', N);
    const colHeads = puz.cols.map((n, c) => {
      const el = h('div', { class: 'te-count top' }, String(n));
      el.style.gridRow = 1; el.style.gridColumn = c + 1;
      board.append(el);
      return el;
    });
    const rowHeads = puz.rows.map((n, r) => {
      const el = h('div', { class: 'te-count side' }, String(n));
      el.style.gridRow = r + 2; el.style.gridColumn = N + 1;
      board.append(el);
      return el;
    });
    const cells = [];
    for (let i = 0; i < NN; i++) {
      const el = h('div', { class: 'te-cell', role: 'gridcell', dataset: { i } });
      el.style.gridRow = row(i) + 2; el.style.gridColumn = col(i) + 1;
      if (isTree(i)) el.append(svgEl(TREE));
      else el.append(svgEl(TENT), h('span', { class: 'te-grass' }));
      board.append(el);
      cells.push(el);
    }
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });
    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      tentFirst: toolButton({ icon: 'square', label: t('tool.tent'), title: t('tool.tentTitle'), toggle: true, onClick: () => { tentFirst = !tentFirst; storage.set('te:tentFirst', tentFirst); render(); } }),
      autoGrass: toolButton({ icon: 'cross', label: t('tool.autoX'), title: t('tool.autoGrassTitle'), toggle: true, onClick: () => { autoGrass = !autoGrass; storage.set('te:autoGrass', autoGrass); hint = null; render(); } }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const root = h('div', { class: 'te' }, h('div', { class: 'te-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)));
    container.append(root);

    // --- logique d'affichage ---------------------------------------------
    const tentCount = (u) => lines[u].filter((i) => marks[i] === 1).length;
    function derivedGrass() {
      const d = new Uint8Array(NN);
      if (!autoGrass) return d;
      for (let i = 0; i < NN; i++) {
        if (isTree(i)) continue;
        if (!n4[i].some(isTree)) d[i] = 1;
        if (marks[i] === 1) for (const j of n8[i]) if (!isTree(j)) d[j] = 1;
      }
      for (let u = 0; u < 2 * N; u++) {
        const target = u < N ? puz.rows[u] : puz.cols[u - N];
        if (tentCount(u) >= target) for (const i of lines[u]) if (!isTree(i) && marks[i] !== 1) d[i] = 1;
      }
      return d;
    }
    // état visuel : 0 vide, 1 tente, 2 herbe
    const visual = (i, d) => (marks[i] === 1 ? 1 : marks[i] === 2 || d[i] ? 2 : 0);
    function nextMark(i, d) {
      const v = visual(i, d);
      if (v === 1) return tentFirst && !d[i] ? 2 : 0;
      if (v === 2) return marks[i] === 2 ? (tentFirst ? 0 : 1) : 1; // herbe automatique : on peut quand même forcer une tente
      return tentFirst ? 1 : 2;
    }

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
    const isWrong = (i) => (marks[i] === 1 && !isTent(i)) || (marks[i] === 2 && isTent(i));
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < NN; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('te.noErrors') : wrong.size === 1 ? t('te.errorFound') : t('te.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished) return;
      let tents = 0;
      let total = 0;
      for (let i = 0; i < NN; i++) if (isTent(i)) total++;
      for (let i = 0; i < NN; i++) if (marks[i] === 1) tents++;
      if (tents !== total) return;
      for (let i = 0; i < NN; i++) if (marks[i] === 1 && !isTent(i)) { message = { text: t('te.fullButWrong') }; return render(); }
      finished = true;
      sel = -1;
      render();
      consume(N, diff, pid);
      ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
    }

    // --- indices ----------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('te.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les tentes justes et l'herbe juste posées par le joueur.
      const st = newState(puz);
      for (let i = 0; i < NN; i++) {
        if (marks[i] === 1 && isTent(i)) st.cs[i] = 1;
        else if (marks[i] === 2 && !isTent(i)) st.cs[i] = 0;
      }
      const rcOf = (i) => [row(i), col(i)];
      const plan = planHint({
        collect: () => allSteps(st, 5),
        apply: (step) => { if (!step.contra) for (const [i, v] of step.cells) st.cs[i] = v; },
        fresh: (step) => (step.contra ? [] : step.cells.filter(([i, v]) => v === 1 && marks[i] !== 1)),
        where: (step, f) => f.map(([i]) => rcOf(i)),
        last: sel >= 0 ? rcOf(sel) : null,
      });
      let found = plan ? { step: plan.step, cells: plan.fresh, prior: plan.prior } : null;
      if (!found) {
        const cand = [...Array(NN).keys()].filter((k) => isTent(k) && marks[k] !== 1);
        if (!cand.length) return;
        if (sel >= 0) cand.sort((x, y) => manhattan(rcOf(x), rcOf(sel)) - manhattan(rcOf(y), rcOf(sel)));
        found = { step: { tech: 'search', cells: [[cand[0], 1]], units: [], focus: [cand[0]] }, cells: [[cand[0], 1]], prior: [] };
      }
      hint = { ...found, revealed: false };
      showHint();
    }
    /** Cases en cause dans l'impasse. */
    function failCellsOf(f) {
      if (!f) return [];
      if (f.kind === 'touch') return f.cells;
      if (f.cell != null) return [f.cell];
      return f.u != null ? lines[f.u] : [];
    }
    function unitLabel(u) { return u < N ? t('te.u.row', { n: u + 1 }) : t('te.u.col', { n: u - N + 1 }); }
    /** Paramètres concrets du texte : ligne/colonne, arbre, case de la tente. */
    function explain(hn) {
      const s = hn.step;
      const [ti] = hn.cells[0];
      const p = { r: row(ti) + 1, c: col(ti) + 1, n: s.cells.length };
      if (s.units?.length) {
        const u = s.units[0];
        p.unit = u < N ? t('te.u.row', { n: u + 1 }) : t('te.u.col', { n: u - N + 1 });
        p.left = u < N ? puz.rows[u] : puz.cols[u - N];
      }
      if (s.tech === 'single') {
        const tr = s.focus[0];
        p.tr = row(tr) + 1;
        p.tc = col(tr) + 1;
      }
      if (s.tech === 'trial' && s.why) {
        const w = s.why;
        p.rx = row(w.hyp[0]) + 1;
        p.cx = col(w.hyp[0]) + 1;
        p.n = w.ghost.length;
        const f = w.fail;
        p.fail = f ? t(`te.fail.${f.kind}`, { unit: f.u != null ? unitLabel(f.u) : '', target: f.target ?? 0 }) : '';
      }
      return p;
    }
    function showHint() {
      const hn = hint;
      if (hn.revealed) {
        message = {
          text: hn.cells.length === 1 ? t('te.hint.revealOne', { r: row(hn.cells[0][0]) + 1, c: col(hn.cells[0][0]) + 1 }) : t('te.hint.revealMany'),
          action: { label: t('te.hint.place'), run: () => { for (const [i] of hn.cells) marks[i] = 1; commit(); } },
        };
      } else {
        let text = t(hn.step.tech === 'trial' && hn.step.why?.ghost?.length ? 'te.hint.trialChain' : `te.hint.${hn.step.tech}`, explain(hn));
        const names = hn.prior.map((p) => t(`te.prior.${p}`));
        if (names.length) text += ' ' + t('te.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie : appui = cycle, glisser = peindre de l'herbe --------------------
    const cellAt = (e) => {
      const rect = board.getBoundingClientRect();
      const cellW = rect.width / (N + 1);
      const cellH = rect.height / (N + 1);
      const c = Math.floor((e.clientX - rect.left) / cellW);
      const r = Math.floor((e.clientY - rect.top) / cellH) - 1;
      return r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1;
    };
    let drag = null;
    board.addEventListener('pointerdown', (e) => {
      if (finished || e.button > 0) return;
      const i = cellAt(e);
      if (i < 0 || isTree(i)) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      const d = derivedGrass();
      const v = visual(i, d);
      drag = { start: i, mode: v === 0 ? 'grass' : marks[i] === 2 ? 'erase' : null, moved: false, last: i, changed: false };
      sel = i;
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const i = cellAt(e);
      if (i < 0 || i === drag.last) return;
      drag.last = i;
      if (!drag.mode) return;
      const d = derivedGrass();
      const apply = (k) => {
        if (isTree(k)) return;
        if (drag.mode === 'grass' && marks[k] === 0 && !d[k]) { marks[k] = 2; drag.changed = true; }
        else if (drag.mode === 'erase' && marks[k] === 2) { marks[k] = 0; drag.changed = true; }
      };
      if (!drag.moved) { drag.moved = true; apply(drag.start); }
      apply(i);
      render();
    });
    board.addEventListener('pointerup', () => {
      if (!drag) return;
      const dd = drag;
      drag = null;
      if (!dd.moved) { marks[dd.start] = nextMark(dd.start, derivedGrass()); commit(); }
      else if (dd.changed) commit();
      else render();
    });
    board.addEventListener('pointercancel', () => { drag = null; render(); });

    // --- rendu ------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const d = derivedGrass();
      const s = hint?.step;
      const lineSet = new Set();
      const focusSet = new Set();
      if (s && !hint.revealed) {
        for (const u of s.units ?? []) for (const i of lines[u]) lineSet.add(i);
        for (const i of s.focus ?? []) focusSet.add(i);
      }
      const why = s && !hint.revealed && s.tech === 'trial' ? s.why : null;
      const ghostSet = new Set((why?.ghost ?? []).map(([i]) => i));
      const failSet = new Set(why ? failCellsOf(why.fail) : []);
      const revealSet = hint?.revealed ? new Set(hint.cells.map(([i]) => i)) : null;
      for (let i = 0; i < NN; i++) {
        const cls = ['te-cell'];
        if (isTree(i)) cls.push('tree');
        else {
          const v = visual(i, d);
          if (v === 1) cls.push('has-tent');
          else if (v === 2) cls.push('has-grass');
          if (marks[i] === 2) cls.push('manual');
          if ((mode === 'live' && isWrong(i)) || wrong.has(i)) cls.push('bad');
        }
        if (lineSet.has(i)) cls.push('hint-unit');
        if (focusSet.has(i)) cls.push('hint-focus');
        if (revealSet?.has(i)) cls.push('hint-cell');
        cells[i].dataset.g = '';
        if (why) {
          if (i === why.hyp[0]) { cls.push('hint-hyp'); cells[i].dataset.g = why.hyp[1] === 1 ? '▲' : '≈'; }
          else if (ghostSet.has(i)) { cls.push('hint-ghost'); cells[i].dataset.g = '▲'; }
          if (failSet.has(i)) cls.push('hint-fail');
        }
        if (i === sel && !finished) cls.push('sel');
        cells[i].className = cls.join(' ');
        cells[i].setAttribute('aria-label', t('te.cellAria', { r: row(i) + 1, c: col(i) + 1 }) + ', ' + t(isTree(i) ? 'te.tree' : marks[i] === 1 ? 'te.tent' : visual(i, d) === 2 ? 'te.grass' : 'te.empty'));
      }
      const mark = (el, u, target) => {
        const n = tentCount(u);
        el.classList.toggle('met', n === target);
        el.classList.toggle('over', n > target);
      };
      colHeads.forEach((el, c) => mark(el, N + c, puz.cols[c]));
      rowHeads.forEach((el, r) => mark(el, r, puz.rows[r]));
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      tools.tentFirst.setAttribute('aria-pressed', String(tentFirst));
      tools.autoGrass.setAttribute('aria-pressed', String(autoGrass));
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
        sel = Math.min(N - 1, Math.max(0, row(from) + move[0])) * N + Math.min(N - 1, Math.max(0, col(from) + move[1]));
        return render();
      }
      if (sel < 0 || isTree(sel)) return;
      if (k === ' ' || k === 'Enter') { e.preventDefault(); marks[sel] = nextMark(sel, derivedGrass()); return commit(); }
      if (k === 't' || k === 'T') { marks[sel] = marks[sel] === 1 ? 0 : 1; return commit(); }
      if (k === 'x' || k === 'X') { marks[sel] = marks[sel] === 2 ? 0 : 2; return commit(); }
      if (k === 'Backspace' || k === 'Delete') { marks[sel] = 0; return commit(); }
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
