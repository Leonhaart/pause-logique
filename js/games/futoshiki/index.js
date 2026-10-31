// Futoshiki : interface. Chiffres 1..N une fois par ligne et colonne, signes < > entre cases voisines.
import { h } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { autoCandidates, planPlacement } from './solver.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const bit = (d) => 1 << (d - 1);

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 5;
    const NN = N * N;
    const saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const given = (i) => puz.giv[i] > 0;
    const row = (i) => Math.floor(i / N);
    const col = (i) => i % N;

    const vals = Int8Array.from(puz.giv);
    const notes = new Uint16Array(NN);
    const snapshot = () => Array.from(vals).join('') + '|' + Array.from(notes, (m) => m.toString(36)).join(',');
    const load = (snap) => {
      const [v, n] = snap.split('|');
      for (let i = 0; i < NN; i++) vals[i] = +v[i];
      n.split(',').forEach((m, i) => (notes[i] = parseInt(m, 36) || 0));
    };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let sel = -1;
    let notesMode = false;
    let wrong = new Set();
    let hint = null; // { cell, digit, step, prior, revealed }
    let message = null;
    let finished = false;

    // --- DOM : cases aux positions paires, signes dans les intervalles ----------
    const T = 2 * N - 1;
    const cells = [];
    const board = h('div', { class: 'fu-board', role: 'grid', 'aria-label': t('game.futoshiki.name') });
    board.style.setProperty('--n', N);
    board.style.gridTemplateColumns = Array.from({ length: T }, (_, k) => (k % 2 ? 'var(--gap)' : '1fr')).join(' ');
    board.style.gridTemplateRows = board.style.gridTemplateColumns;
    for (let i = 0; i < NN; i++) {
      const noteEls = Array.from({ length: N }, () => h('span'));
      const val = h('span', { class: 'fu-val' });
      const el = h('div', { class: 'fu-cell', role: 'gridcell', dataset: { i } }, h('div', { class: 'fu-notes', 'aria-hidden': 'true' }, noteEls), val);
      el.style.gridRow = 2 * row(i) + 1;
      el.style.gridColumn = 2 * col(i) + 1;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); select(i); });
      board.append(el);
      cells.push({ el, val, noteEls });
    }
    const signs = puz.rel.map(([a, b]) => {
      const horizontal = Math.abs(a - b) === 1;
      const lo = Math.min(a, b);
      const el = h('div', { class: `fu-sign ${horizontal ? 'h' : 'v'}`, 'aria-hidden': 'true' }, h('span', {}, a === lo ? '<' : '>'));
      el.style.gridRow = horizontal ? 2 * row(lo) + 1 : 2 * row(lo) + 2;
      el.style.gridColumn = horizontal ? 2 * col(lo) + 2 : 2 * col(lo) + 1;
      board.append(el);
      return { a, b, el };
    });

    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });
    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      erase: toolButton({ icon: 'eraser', label: t('tool.erase'), onClick: () => erase() }),
      notes: toolButton({ icon: 'pencil', label: t('tool.notes'), title: t('tool.notesTitle'), toggle: true, onClick: () => { notesMode = !notesMode; render(); } }),
      auto: toolButton({ icon: 'sparkle', label: t('tool.autoShort'), title: t('tool.autoNotes'), onClick: () => autoNotes() }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const keys = [];
    const pad = h('div', { class: 'fu-pad' });
    pad.style.setProperty('--n', N);
    for (let d = 1; d <= N; d++) {
      const btn = h('button', { class: 'fu-key', 'aria-label': String(d), onClick: () => applyDigit(d) }, String(d));
      pad.append(btn);
      keys.push(btn);
    }
    const root = h('div', { class: 'fu' }, h('div', { class: 'fu-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)), pad);
    container.append(root);

    // --- actions ------------------------------------------------------------
    const persist = () => ctx.save({ ...hist.dump(), pid });
    function reset() { wrong = new Set(); hint = null; message = null; }
    function commit() {
      reset();
      if (hist.commit(snapshot())) persist();
      render();
      checkComplete();
    }
    function select(i) { sel = i; render(); }
    function peersOf(i) {
      const out = [];
      for (let k = 0; k < N; k++) { out.push(row(i) * N + k, k * N + col(i)); }
      return out.filter((j) => j !== i);
    }
    function setValue(i, d) {
      if (given(i) || finished) return;
      vals[i] = d;
      notes[i] = 0;
      for (const p of peersOf(i)) if (!given(p) && !vals[p]) notes[p] &= ~bit(d);
      commit();
    }
    function erase() {
      if (sel < 0 || given(sel) || finished) return;
      if (vals[sel]) vals[sel] = 0; else notes[sel] = 0;
      commit();
    }
    function applyDigit(d) {
      if (sel < 0 || finished || given(sel)) return;
      if (notesMode) {
        if (vals[sel]) return;
        notes[sel] ^= bit(d);
        commit();
      } else if (vals[sel] === d) erase();
      else setValue(sel, d);
    }
    function autoNotes() {
      if (finished) return;
      const c = autoCandidates(puz, vals);
      for (let i = 0; i < NN; i++) notes[i] = vals[i] ? 0 : c[i];
      commit();
    }
    function undo() { const s = hist.undo(); if (s == null) return; load(s); reset(); persist(); render(); }
    function redo() { const s = hist.redo(); if (s == null) return; load(s); reset(); persist(); render(); }

    // --- vérification et fin ------------------------------------------------
    const isWrong = (i) => !given(i) && vals[i] !== 0 && vals[i] !== sol[i];
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < NN; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('fu.noErrors') : wrong.size === 1 ? t('fu.errorFound') : t('fu.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished || vals.some((v) => !v)) return;
      if (vals.every((v, i) => v === sol[i])) {
        finished = true;
        sel = -1;
        render();
        consume(N, diff, pid);
        ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
      } else {
        message = { text: t('fu.fullButWrong') };
        render();
      }
    }

    // --- indices ------------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('fu.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les chiffres justes du joueur.
      const g = Int8Array.from(vals, (v, i) => (given(i) || v === sol[i] ? v : 0));
      let found = planPlacement(puz, g, sel >= 0 ? [row(sel), col(sel)] : null);
      if (!found) {
        const i = [...Array(NN).keys()].find((k) => g[k] === 0);
        if (i == null) return;
        found = { cell: i, digit: sol[i], step: { tech: 'search', units: [], focus: [i] }, prior: [] };
      }
      hint = { ...found, revealed: false };
      sel = found.cell;
      showHint();
    }
    /** Paramètres concrets du texte : cases (ligne/colonne), chiffres, ligne ou colonne concernée. */
    function explain(hn) {
      const s = hn.step;
      const rcs = (cs) => cs.map((i) => `L${row(i) + 1}C${col(i) + 1}`).join(', ');
      const p = { r: row(hn.cell) + 1, c: col(hn.cell) + 1, d: hn.digit, cells: rcs(s.focus ?? []), k: (s.focus ?? []).length };
      if (s.units?.length) {
        const u = s.units[0];
        p.unit = u < N ? t('fu.u.row', { n: u + 1 }) : t('fu.u.col', { n: u - N + 1 });
      }
      if (s.tech === 'single') {
        const at = s.focus[0];
        p.d = Math.round(Math.log2(s.set[0][1])) + 1;
        p.r = row(at) + 1;
        p.c = col(at) + 1;
        p.where = s.units[0] < N ? t('fu.at.col', { n: col(at) + 1 }) : t('fu.at.row', { n: row(at) + 1 });
      }
      if (s.tech === 'bound') {
        const [a, b] = s.focus;
        p.r1 = row(a) + 1; p.c1 = col(a) + 1; p.r2 = row(b) + 1; p.c2 = col(b) + 1;
      }
      if (s.tech === 'trial') {
        const [x] = s.focus;
        p.rx = row(x) + 1; p.cx = col(x) + 1; p.t = s.digit;
      }
      return p;
    }
    function showHint() {
      const hn = hint;
      if (hn.revealed) {
        message = {
          text: t('fu.hint.answer', { r: row(hn.cell) + 1, c: col(hn.cell) + 1, d: hn.digit }),
          action: { label: t('fu.hint.place', { d: hn.digit }), run: () => setValue(hn.cell, hn.digit) },
        };
      } else {
        let text = t(`fu.hint.${hn.step.tech}`, explain(hn));
        if (hn.step.tech === 'single' && hn.cell !== hn.step.focus[0]) text += ' ' + t('fu.hint.then', { r: row(hn.cell) + 1, c: col(hn.cell) + 1 });
        const names = [...new Set(hn.prior)].map((p) => t(`fu.prior.${p}`));
        if (names.length) text += ' ' + t('fu.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- rendu --------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const selVal = sel >= 0 ? vals[sel] : 0;
      const peerSet = sel >= 0 ? new Set(peersOf(sel)) : null;
      const lineSet = new Set();
      const focusSet = new Set();
      if (hint && !hint.revealed) {
        for (const u of hint.step.units ?? []) {
          for (let k = 0; k < N; k++) lineSet.add(u < N ? u * N + k : k * N + (u - N));
        }
        for (const c of hint.step.focus ?? []) focusSet.add(c);
      }
      const counts = new Array(N + 1).fill(0);
      for (let i = 0; i < NN; i++) counts[vals[i]]++;
      for (let i = 0; i < NN; i++) {
        const v = vals[i];
        const cls = ['fu-cell'];
        if (given(i)) cls.push('given'); else if (v) cls.push('user');
        if (v) cls.push('has-val');
        if (peerSet?.has(i)) cls.push('peer');
        if (selVal && v === selVal && i !== sel) cls.push('same');
        if (i === sel && !finished) cls.push('sel');
        if ((mode === 'live' && isWrong(i)) || wrong.has(i)) cls.push('bad');
        if (lineSet.has(i)) cls.push('hint-unit');
        if (focusSet.has(i) || (hint?.revealed && hint.cell === i)) cls.push('hint-cell');
        cells[i].el.className = cls.join(' ');
        cells[i].val.textContent = v || '';
        cells[i].noteEls.forEach((s, k) => { s.textContent = notes[i] & bit(k + 1) ? String(k + 1) : ''; });
        cells[i].el.setAttribute('aria-label', t('fu.cellAria', { r: row(i) + 1, c: col(i) + 1 }) + ', ' + (v ? String(v) : t('fu.empty')));
      }
      for (const s of signs) {
        const bad = mode === 'live' && vals[s.a] && vals[s.b] && !(vals[s.a] < vals[s.b]);
        s.el.classList.toggle('bad', !!bad);
      }
      keys.forEach((btn, k) => { btn.disabled = finished; btn.classList.toggle('done', counts[k + 1] >= N); });
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      tools.notes.setAttribute('aria-pressed', String(notesMode));
      root.classList.toggle('fu-notes-mode', notesMode);
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
      if (k >= '1' && k <= String(N)) return applyDigit(+k);
      if (k === 'Backspace' || k === 'Delete') return erase();
      if (k === 'n' || k === 'N') { notesMode = !notesMode; render(); }
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
