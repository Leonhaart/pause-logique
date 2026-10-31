// Akari : interface. Appui = ampoule, appui suivant = point (« pas d'ampoule »), puis vide ; glisser = poser des points.
import { h, svgEl } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { geoOf, newState, allSteps, litCells, isSolution } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const BULB = '<svg viewBox="0 0 24 24" class="ak-bulb" aria-hidden="true"><circle cx="12" cy="12" r="6.200"/><path d="M12 2.200v2.300M12 19.500v2.300M2.200 12h2.300M19.500 12h2.300M5.100 5.100l1.600 1.600M17.300 17.300l1.600 1.600M5.100 18.900l1.600-1.600M17.300 6.700l1.600-1.600"/></svg>';

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 9;
    const NN = N * N;
    const saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const g = geoOf(puz);
    const isWall = (i) => puz.wall[i] === 1;
    const row = (i) => Math.floor(i / N);
    const col = (i) => i % N;

    // marks : 0 vide, 1 ampoule, 2 point (pas d'ampoule)
    const marks = new Uint8Array(NN);
    const snapshot = () => Array.from(marks).join('');
    const load = (snap) => { for (let i = 0; i < NN; i++) marks[i] = +snap[i]; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let wrong = new Set();
    let hint = null;
    let message = null;
    let finished = false;
    let sel = -1;

    // --- DOM ---------------------------------------------------------------
    const board = h('div', { class: 'ak-board', role: 'grid', 'aria-label': t('game.akari.name') });
    board.style.setProperty('--n', N);
    const cells = [];
    for (let i = 0; i < NN; i++) {
      const el = h('div', { class: 'ak-cell', role: 'gridcell' });
      if (isWall(i)) el.append(h('span', { class: 'ak-num' }, puz.num[i] >= 0 ? String(puz.num[i]) : ''));
      else el.append(svgEl(BULB), h('span', { class: 'ak-dot' }));
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
    const root = h('div', { class: 'ak' }, h('div', { class: 'ak-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)));
    container.append(root);

    // --- logique d'affichage -----------------------------------------------
    const bulbCs = () => Int8Array.from(marks, (m, i) => (isWall(i) ? 2 : m === 1 ? 1 : 0));
    const lightOf = () => litCells(puz, bulbCs());
    const clash = (i) => marks[i] === 1 && g.view[i].some((j) => j !== i && marks[j] === 1);
    const wallCount = (w) => g.nbr[w].filter((j) => marks[j] === 1).length;

    // --- historique --------------------------------------------------------
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

    // --- vérification et fin -------------------------------------------------
    const isWrong = (i) => !isWall(i) && ((marks[i] === 1 && sol[i] !== 1) || (marks[i] === 2 && sol[i] === 1));
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < NN; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('ak.noErrors') : wrong.size === 1 ? t('ak.errorFound') : t('ak.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished || !isSolution(puz, bulbCs())) return;
      finished = true;
      sel = -1;
      render();
      consume(N, diff, pid);
      ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
    }

    // --- indices -----------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('ak.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les ampoules justes et les points justes posés par le joueur.
      const st = newState(puz);
      for (const i of g.whites) {
        if (marks[i] === 1 && sol[i] === 1) st.cs[i] = 1;
        else if (marks[i] === 2 && sol[i] !== 1) st.cs[i] = 0;
      }
      const last = sel >= 0 ? [row(sel), col(sel)] : null;
      // toutes les déductions disponibles : la plus facile, et à égalité la plus proche de la dernière case touchée
      const plan = planHint({
        collect: () => allSteps(st, 4),
        apply: (s) => { for (const [i, v] of s.cells) st.cs[i] = v; },
        fresh: (s) => s.cells.filter(([i, v]) => v === 1 && marks[i] !== 1),
        where: (s, f) => f.map(([i]) => [row(i), col(i)]),
        last,
      });
      let found = null;
      if (plan) found = { step: plan.step, cells: plan.fresh, prior: plan.prior, info: explain(plan.step, plan.fresh) };
      else {
        let k = -1;
        let bd = Infinity;
        for (const x of g.whites) {
          if (sol[x] !== 1 || marks[x] === 1) continue;
          const dd = last ? manhattan([row(x), col(x)], last) : 0;
          if (dd < bd) { bd = dd; k = x; }
        }
        if (k < 0) return;
        found = { step: { tech: 'search', cells: [[k, 1]], focus: [k] }, cells: [[k, 1]], prior: [], info: { r: row(k) + 1, c: col(k) + 1 } };
      }
      hint = { ...found, revealed: false };
      showHint();
    }
    /** Paramètres concrets du texte d'indice. */
    function explain(step, fresh) {
      const [b] = fresh[0];
      const p = { r: row(b) + 1, c: col(b) + 1 };
      if (step.tech === 'full' || step.tech === 'combo') {
        const w = step.focus[0];
        p.wr = row(w) + 1;
        p.wc = col(w) + 1;
        p.n = puz.num[w];
        p.k = fresh.length;
      } else if (step.tech === 'only') {
        const lit = step.focus[0];
        p.lr = row(lit) + 1;
        p.lc = col(lit) + 1;
      }
      return p;
    }
    function showHint() {
      const hn = hint;
      if (hn.revealed) {
        message = {
          text: hn.cells.length === 1 ? t('ak.hint.revealOne', { r: row(hn.cells[0][0]) + 1, c: col(hn.cells[0][0]) + 1 }) : t('ak.hint.revealMany'),
          action: { label: t('ak.hint.place'), run: () => { for (const [i] of hn.cells) marks[i] = 1; sel = hn.cells[0][0]; commit(); } },
        };
      } else {
        let text = t(`ak.hint.${hn.step.tech}`, hn.info);
        const names = [...new Set(hn.prior.filter((p) => p !== hn.step.tech).map((p) => t(`ak.prior.${p}`)))];
        if (names.length) text += ' ' + t('ak.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie ------------------------------------------------------------
    const cellAt = (e) => {
      const rect = board.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
      return r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1;
    };
    const nextMark = (i) => (marks[i] + 1) % 3;
    let drag = null;
    board.addEventListener('pointerdown', (e) => {
      if (finished || e.button > 0) return;
      const i = cellAt(e);
      if (i < 0 || isWall(i)) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      drag = { start: i, mode: marks[i] === 0 ? 'dot' : marks[i] === 2 ? 'erase' : null, moved: false, last: i, changed: false };
      sel = i;
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const i = cellAt(e);
      if (i < 0 || i === drag.last) return;
      drag.last = i;
      if (!drag.mode) return;
      const apply = (k) => {
        if (isWall(k)) return;
        if (drag.mode === 'dot' && marks[k] === 0) { marks[k] = 2; drag.changed = true; }
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
      if (!dd.moved) { marks[dd.start] = nextMark(dd.start); commit(); }
      else if (dd.changed) commit();
      else render();
    });
    board.addEventListener('pointercancel', () => { drag = null; render(); });

    // --- rendu -------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const lit = lightOf();
      const s = hint?.step;
      const lineSet = new Set();
      const focusSet = new Set();
      if (s && !hint.revealed) {
        for (const i of s.lines ?? []) { lineSet.add(i); for (const j of g.view[i] ?? []) lineSet.add(j); }
        for (const i of s.focus ?? []) focusSet.add(i);
      }
      const revealSet = hint?.revealed ? new Set(hint.cells.map(([i]) => i)) : null;
      for (let i = 0; i < NN; i++) {
        const cls = ['ak-cell'];
        if (isWall(i)) {
          cls.push('wall');
          if (puz.num[i] >= 0) {
            const n = wallCount(i);
            if (n === puz.num[i]) cls.push('met');
            else if (n > puz.num[i] && mode === 'live') cls.push('over');
          }
        } else {
          if (lit[i]) cls.push('lit');
          if (marks[i] === 1) cls.push('has-bulb');
          else if (marks[i] === 2) cls.push('has-dot');
          if ((mode === 'live' && (isWrong(i) || clash(i))) || wrong.has(i)) cls.push('bad');
        }
        if (lineSet.has(i)) cls.push('hint-unit');
        if (focusSet.has(i)) cls.push('hint-focus');
        if (revealSet?.has(i)) cls.push('hint-cell');
        if (i === sel && !finished) cls.push('sel');
        cells[i].className = cls.join(' ');
        const what = isWall(i) ? (puz.num[i] >= 0 ? t('ak.wallNum', { n: puz.num[i] }) : t('ak.wall')) : marks[i] === 1 ? t('ak.bulb') : marks[i] === 2 ? t('ak.dot') : lit[i] ? t('ak.lit') : t('ak.empty');
        cells[i].setAttribute('aria-label', t('ak.cellAria', { r: row(i) + 1, c: col(i) + 1 }) + ', ' + what);
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

    // --- clavier -----------------------------------------------------------
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
      if (sel < 0 || isWall(sel)) return;
      if (k === ' ' || k === 'Enter') { e.preventDefault(); marks[sel] = nextMark(sel); return commit(); }
      if (k === 'b' || k === 'B') { marks[sel] = marks[sel] === 1 ? 0 : 1; return commit(); }
      if (k === 'x' || k === 'X' || k === '.') { marks[sel] = marks[sel] === 2 ? 0 : 2; return commit(); }
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
