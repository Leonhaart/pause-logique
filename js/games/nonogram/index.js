// Nonogram : interface. Les nombres donnent les blocs de cases noires de chaque ligne et colonne.
import { h } from '../../core/dom.js';
import { storage } from '../../core/storage.js';
import { History, toolButton } from '../../ui/kit.js';
import { allSteps, runsOf } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TECH_TEXT = { basic: 'ng.hint.basic', bounds: 'ng.hint.bounds', line: 'ng.hint.line', trial: 'ng.hint.trial', search: 'ng.hint.search' };

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 10;
    const NN = N * N;
    const saved = ctx.restore;
    const { pid, name, colors, grid, rows, cols } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const sol = grid;

    // états : 0 inconnue, 1 noire, 2 croix
    const st = new Uint8Array(NN);
    const snapshot = () => Array.from(st).join('');
    const load = (snap) => { for (let i = 0; i < NN; i++) st[i] = +snap[i]; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let crossMode = false;
    let wrong = new Set();
    let hint = null; // { step, revealed }
    let message = null;
    let finished = false;
    // une fois l'image terminée, les cases prennent les couleurs du dessin (une couleur par image si elle n'en a pas)
    const fallback = ['#e4572e', '#2e86ab', '#3f9d5a', '#8e5bd1', '#e0a21b', '#d6457f'][ctx.seed % 6 || 0];
    let focus = -1;

    // --- taille des cases ---------------------------------------------------
    const maxRowClue = Math.max(1, ...rows.map((r) => r.length));
    const maxColClue = Math.max(1, ...cols.map((c) => c.length));
    const fit = () => {
      const W = Math.min(container.clientWidth || 390, 640);
      const fs = 11;
      const clueW = maxRowClue * (fs + 7) + 16;
      // en hauteur aussi : sur un écran d'ordinateur peu haut, toute la grille doit tenir (limite de .ng-scroll)
      const clueH = maxColClue * (fs + 7) + 16;
      const H = (window.innerHeight || 800) - 270;
      return clamp(Math.min(Math.floor((W - clueW - 8) / N), Math.floor((H - clueH - 8) / N)), 16, 52);
    };
    let cs = storage.get(`ng:cs:${N}`, null) ?? fit();
    const csFont = () => clamp(Math.round(cs * 0.52), 10, 18);

    // --- DOM ----------------------------------------------------------------
    const cells = [];
    const cellBox = h('div', { class: 'ng-cells', role: 'grid', 'aria-label': t('game.nonogram.name') });
    for (let i = 0; i < NN; i++) {
      const r = (i / N) | 0;
      const c = i % N;
      const el = h('div', { class: 'ng-cell', role: 'gridcell', dataset: { i } });
      if (c % 5 === 4 && c < N - 1) el.classList.add('g-r');
      if (r % 5 === 4 && r < N - 1) el.classList.add('g-b');
      cellBox.append(el);
      cells.push(el);
    }
    const rowClueEls = rows.map((cl) => h('div', { class: 'ng-rowclue' }, (cl.length ? cl : [0]).map((n) => h('span', {}, String(n)))));
    const colClueEls = cols.map((cl) => h('div', { class: 'ng-colclue' }, (cl.length ? cl : [0]).map((n) => h('span', {}, String(n)))));
    rowClueEls.forEach((el, r) => { if (r % 5 === 4 && r < N - 1) el.classList.add('g-b'); });
    colClueEls.forEach((el, c) => { if (c % 5 === 4 && c < N - 1) el.classList.add('g-r'); });
    const colClueBox = h('div', { class: 'ng-colclues' }, colClueEls);
    const rowClueBox = h('div', { class: 'ng-rowclues' }, rowClueEls);
    const gridEl = h('div', { class: 'ng-grid' }, h('div', { class: 'ng-corner' }), colClueBox, rowClueBox, cellBox);
    const scroller = h('div', { class: 'ng-scroll' }, gridEl);
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });

    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      mode: toolButton({ icon: 'cross', label: t('tool.crossMode'), title: t('tool.crossModeTitle'), toggle: true, onClick: () => { crossMode = !crossMode; render(); } }),
      zoomOut: toolButton({ icon: 'minus', label: t('tool.zoomOut'), onClick: () => zoom(-4) }),
      zoomIn: toolButton({ icon: 'plus', label: t('tool.zoomIn'), onClick: () => zoom(4) }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const root = h('div', { class: 'ng' }, scroller, msgEl, h('div', { class: 'tools' }, Object.values(tools)));
    container.append(root);

    function applySize() {
      gridEl.style.setProperty('--n', N);
      gridEl.style.setProperty('--cs', cs + 'px');
      gridEl.style.setProperty('--cf', csFont() + 'px');
      gridEl.style.setProperty('--clue-rows', maxColClue);
    }
    function zoom(d) {
      cs = clamp(cs + d, 14, 56);
      storage.set(`ng:cs:${N}`, cs);
      applySize();
      render();
    }
    applySize();

    // --- état dérivé ----------------------------------------------------------
    const lineBits = (isRow, k) => {
      let m = 0;
      for (let i = 0; i < N; i++) if (st[isRow ? k * N + i : i * N + k] === 1) m |= 1 << i;
      return m;
    };
    const sameRuns = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    function persist() {
      ctx.save({ ...hist.dump(), pid });
    }
    function commit() {
      wrong = new Set();
      hint = null;
      message = null;
      if (hist.commit(snapshot())) persist();
      render();
      checkComplete();
    }
    function undo() {
      const s = hist.undo();
      if (s == null) return;
      load(s);
      wrong = new Set(); hint = null; message = null;
      persist(); render();
    }
    function redo() {
      const s = hist.redo();
      if (s == null) return;
      load(s);
      wrong = new Set(); hint = null; message = null;
      persist(); render();
    }

    // --- vérification et fin ----------------------------------------------------
    const isWrong = (i) => (st[i] === 1 && !sol[i]) || (st[i] === 2 && sol[i] === 1);
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < NN; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('ng.noErrors') : wrong.size === 1 ? t('ng.errorFound') : t('ng.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished) return;
      for (let i = 0; i < NN; i++) if ((st[i] === 1) !== (sol[i] === 1)) return;
      finished = true;
      for (let i = 0; i < NN; i++) if (st[i] === 2) st[i] = 0;
      message = name ? { text: t('ng.picture', { name }) } : null;
      render();
      consume(N, diff, pid);
      ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock }, note: name ? t('ng.picture', { name }) : null });
    }

    // --- indices ------------------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) {
        message = { text: t('ng.hintsOff') };
        return render();
      }
      if (hint && !hint.revealed) {
        hint.revealed = true;
        return showHint();
      }
      // on ne retient que ce que le joueur a de juste
      const known = new Uint8Array(NN);
      for (let i = 0; i < NN; i++) {
        if (st[i] === 1 && sol[i]) known[i] = 1;
        else if (st[i] === 2 && !sol[i]) known[i] = 2;
      }
      const rcOf = (i) => [Math.floor(i / N), i % N];
      const plan = planHint({
        collect: () => allSteps(known, N, rows, cols, 4),
        apply: (step) => { step.cells.forEach((i, j) => { known[i] = step.values[j]; }); },
        fresh: (step) => step.cells.map((i, j) => [i, step.values[j]]).filter(([i, v]) => known[i] !== v && st[i] !== v),
        where: (step, f) => f.map(([i]) => rcOf(i)),
        last: focus >= 0 ? rcOf(focus) : null,
      });
      let step = plan ? { ...plan.step, cells: plan.fresh.map(([i]) => i), values: plan.fresh.map(([, v]) => v), prior: plan.prior } : null;
      if (!step) {
        const cand = [...Array(NN).keys()].filter((k) => !known[k]);
        if (!cand.length) return;
        if (focus >= 0) cand.sort((x, y) => manhattan(rcOf(x), rcOf(focus)) - manhattan(rcOf(y), rcOf(focus)));
        const i = cand[0];
        step = { tech: 'search', isRow: null, k: -1, cells: [i], values: [sol[i] ? 1 : 2], prior: [] };
      }
      hint = { step, revealed: false };
      showHint();
    }
    /** Paramètres concrets : ligne/colonne, indice de la ligne, nombre de cases, case de l'essai. */
    function explain(s) {
      const p = { n: s.cells.length, r: Math.floor(s.cells[0] / N) + 1, c: (s.cells[0] % N) + 1 };
      if (s.isRow !== null && s.isRow !== undefined && s.k >= 0) {
        const clue = (s.isRow ? rows : cols)[s.k];
        p.unit = s.isRow ? t('ng.u.row', { n: s.k + 1 }) : t('ng.u.col', { n: s.k + 1 });
        p.clue = clue.length ? clue.join(' ') : '0';
        p.black = s.values.filter((v) => v === 1).length;
        p.cross = s.values.filter((v) => v === 2).length;
      }
      p.v = s.values[0] === 1 ? t('ng.v.black') : t('ng.v.cross');
      p.o = s.values[0] === 1 ? t('ng.v.cross') : t('ng.v.black');
      return p;
    }
    function showHint() {
      const s = hint.step;
      if (hint.revealed) {
        message = {
          text: t('ng.hint.reveal'),
          action: { label: t('ng.hint.apply'), run: () => { s.cells.forEach((idx, j) => { st[idx] = s.values[j]; }); commit(); } },
        };
      } else {
        let text = t(TECH_TEXT[s.tech] ?? 'ng.hint.trial', explain(s));
        if (s.prior?.length) text += ' ' + t('ng.hint.prior');
        message = { text, action: { label: t('sb.hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie : appui ou glisser le long d'une ligne ----------------------------
    const cellAt = (e) => {
      const rect = cellBox.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
      return r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1;
    };
    let drag = null; // { paint, action, axis, r0, c0, changed }
    cellBox.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const i = cellAt(e);
      if (i < 0) return;
      e.preventDefault();
      cellBox.setPointerCapture?.(e.pointerId);
      const paint = e.button === 2 || crossMode ? 2 : 1;
      const action = st[i] === paint ? 0 : paint;
      drag = { paint, action, axis: null, r0: (i / N) | 0, c0: i % N, changed: false };
      focus = i;
      setCell(i);
      render();
    });
    function setCell(i) {
      if (st[i] === drag.action) return;
      if (drag.action !== 0 && st[i] !== 0 && st[i] !== drag.paint && !(i === drag.r0 * N + drag.c0)) return; // on ne remplace pas l'autre marque en glissant
      if (drag.action === 0 && st[i] !== drag.paint) return;
      st[i] = drag.action;
      drag.changed = true;
    }
    cellBox.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const i = cellAt(e);
      if (i < 0) return;
      const r = (i / N) | 0;
      const c = i % N;
      if (!drag.axis) {
        if (r === drag.r0 && c === drag.c0) return;
        drag.axis = Math.abs(c - drag.c0) >= Math.abs(r - drag.r0) ? 'row' : 'col';
      }
      const rr = drag.axis === 'row' ? drag.r0 : r;
      const cc = drag.axis === 'col' ? drag.c0 : c;
      const j = rr * N + cc;
      if (j === focus) return;
      focus = j;
      setCell(j);
      render();
    });
    const endDrag = () => {
      if (!drag) return;
      const changed = drag.changed;
      drag = null;
      if (changed) commit();
      else render();
    };
    cellBox.addEventListener('pointerup', endDrag);
    cellBox.addEventListener('pointercancel', endDrag);
    cellBox.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- rendu ----------------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const s = hint?.step;
      const hintCells = new Set(s && hint ? s.cells : []);
      const fr = focus >= 0 ? (focus / N) | 0 : -1;
      const fc = focus >= 0 ? focus % N : -1;
      for (let i = 0; i < NN; i++) {
        const el = cells[i];
        const cls = ['ng-cell'];
        const r = (i / N) | 0;
        const c = i % N;
        if (c % 5 === 4 && c < N - 1) cls.push('g-r');
        if (r % 5 === 4 && r < N - 1) cls.push('g-b');
        if (st[i] === 1) cls.push('on');
        else if (st[i] === 2) cls.push('x');
        if (focus >= 0 && (r === fr || c === fc) && !finished) cls.push('guide');
        if ((mode === 'live' && isWrong(i)) || wrong.has(i)) cls.push('bad');
        if (s && hint && !hint.revealed && ((s.isRow === true && r === s.k) || (s.isRow === false && c === s.k))) cls.push('hint-line');
        if (hintCells.has(i) && s && (hint.revealed || s.tech === 'trial')) cls.push('hint-cell');
        el.className = cls.join(' ');
        if (finished && st[i] === 1) el.style.setProperty('--c', (colors && colors[i]) || fallback);
      }
      for (let k = 0; k < N; k++) {
        rowClueEls[k].classList.toggle('done', sameRuns(runsOf(lineBits(true, k), N), rows[k]));
        colClueEls[k].classList.toggle('done', sameRuns(runsOf(lineBits(false, k), N), cols[k]));
        rowClueEls[k].classList.toggle('now', k === fr && !finished);
        colClueEls[k].classList.toggle('now', k === fc && !finished);
      }
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      tools.mode.setAttribute('aria-pressed', String(crossMode));
      tools.zoomOut.disabled = cs <= 14;
      tools.zoomIn.disabled = cs >= 56;
      msgEl.replaceChildren();
      if (message) {
        msgEl.append(h('span', {}, message.text));
        if (message.action) msgEl.append(h('button', { class: 'btn', onClick: message.action.run }, message.action.label));
      }
    }

    function onKey(e) {
      if (document.querySelector('.sheet-backdrop') || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.ctrlKey && k === 'y') { e.preventDefault(); return redo(); }
      if (e.ctrlKey || finished) return;
      if (k === 'x') { crossMode = !crossMode; render(); }
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
