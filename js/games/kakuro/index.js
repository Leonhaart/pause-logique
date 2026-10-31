// Kakuro : interface. Appui sur une case blanche, puis pavé de chiffres ; mode notes ; indice en deux temps.
import { h } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { geoOf, newState, allSteps, isSolution, autoCandidates } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const bit = (d) => 1 << (d - 1);
const single = (m) => m !== 0 && (m & (m - 1)) === 0;
const digitOf = (m) => 31 - Math.clz32(m) + 1;

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 8;
    const NN = N * N;
    const saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const g = geoOf(puz);
    const isWhite = (i) => puz.white[i] === 1;
    const isGiven = (i) => puz.given[i] > 0;
    const row = (i) => Math.floor(i / N);
    const col = (i) => i % N;

    const vals = Int8Array.from(puz.given);
    const notes = new Uint16Array(NN);

    // --- historique ----------------------------------------------------------
    const snapshot = () => Array.from(vals).join('') + '|' + Array.from(notes, (m) => m.toString(36)).join(',');
    const load = (snap) => {
      const [v, n] = snap.split('|');
      for (let i = 0; i < NN; i++) vals[i] = isGiven(i) ? puz.given[i] : +v[i] || 0;
      n.split(',').forEach((m, i) => { if (i < NN) notes[i] = parseInt(m, 36) || 0; });
    };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let sel = -1;
    let notesMode = false;
    let wrong = new Set();
    let hint = null; // { step, i, d, prior, revealed }
    let message = null;
    let finished = false;

    // --- DOM -----------------------------------------------------------------
    const board = h('div', { class: 'kk-board', role: 'grid', 'aria-label': t('game.kakuro.name') });
    board.style.setProperty('--n', N);
    const cells = [];
    for (let i = 0; i < NN; i++) {
      if (isWhite(i)) {
        const noteEls = Array.from({ length: 9 }, () => h('span'));
        const val = h('span', { class: 'kk-val' });
        const el = h('div', { class: 'kk-cell', role: 'gridcell' }, h('div', { class: 'kk-notes', 'aria-hidden': 'true' }, noteEls), val);
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!finished) { sel = i; render(); } });
        board.append(el);
        cells.push({ el, val, noteEls });
      } else {
        const el = h('div', { class: puz.right[i] || puz.down[i] ? 'kk-cell black clue' : 'kk-cell black', role: 'gridcell' });
        const r = puz.right[i];
        const d = puz.down[i];
        const rEl = h('span', { class: 'kk-r' }, r ? String(r) : '');
        const dEl = h('span', { class: 'kk-d' }, d ? String(d) : '');
        el.append(rEl, dEl);
        board.append(el);
        cells.push({ el, rEl, dEl });
      }
    }
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });
    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      erase: toolButton({ icon: 'eraser', label: t('tool.erase'), onClick: () => erase() }),
      notes: toolButton({ icon: 'pencil', label: t('tool.notes'), title: t('tool.notesTitle'), toggle: true, onClick: () => toggleNotesMode() }),
      auto: toolButton({ icon: 'sparkle', label: t('tool.autoShort'), title: t('tool.autoNotes'), onClick: () => autoNotes() }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const pad = h('div', { class: 'kk-pad' });
    for (let d = 1; d <= 9; d++) {
      const btn = h('button', { class: 'kk-key', 'aria-label': String(d) }, String(d));
      btn.addEventListener('click', () => applyDigit(d));
      pad.append(btn);
    }
    const root = h('div', { class: 'kk' }, h('div', { class: 'kk-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)), pad);
    container.append(root);

    // --- actions -------------------------------------------------------------
    const persist = () => ctx.save({ ...hist.dump(), pid });
    function reset() { wrong = new Set(); hint = null; message = null; }
    function commit() {
      reset();
      if (hist.commit(snapshot())) persist();
      render();
      checkComplete();
    }
    function setValue(i, d) {
      if (isGiven(i) || finished) return;
      vals[i] = d;
      notes[i] = 0;
      for (const ri of g.runOf[i]) if (ri >= 0) for (const j of g.runs[ri].cells) if (!vals[j]) notes[j] &= ~bit(d);
      commit();
    }
    function toggleNote(i, d) {
      if (isGiven(i) || vals[i] || finished) return;
      notes[i] ^= bit(d);
      commit();
    }
    function erase() {
      if (sel < 0 || isGiven(sel) || finished) return;
      if (vals[sel]) vals[sel] = 0;
      else notes[sel] = 0;
      commit();
    }
    function applyDigit(d) {
      if (sel < 0 || finished || isGiven(sel)) return;
      if (notesMode) toggleNote(sel, d);
      else if (vals[sel] === d) erase();
      else setValue(sel, d);
    }
    function toggleNotesMode() { notesMode = !notesMode; render(); }
    function autoNotes() {
      if (finished) return;
      const c = autoCandidates(puz, vals);
      for (const i of g.whites) notes[i] = vals[i] ? 0 : c[i];
      commit();
    }
    function undo() { const s = hist.undo(); if (s == null) return; load(s); reset(); persist(); render(); }
    function redo() { const s = hist.redo(); if (s == null) return; load(s); reset(); persist(); render(); }

    // --- vérification et fin ---------------------------------------------------
    const isWrong = (i) => isWhite(i) && !isGiven(i) && vals[i] !== 0 && vals[i] !== sol[i];
    /** Case en doublon dans l'une de ses suites. */
    const isDup = (i) => g.runOf[i].some((ri) => ri >= 0 && g.runs[ri].cells.some((j) => j !== i && vals[j] && vals[j] === vals[i]));
    function runInfo(run) {
      let sum = 0;
      let filled = 0;
      for (const i of run.cells) if (vals[i]) { sum += vals[i]; filled++; }
      return { sum, filled, full: filled === run.cells.length };
    }
    function check() {
      if (finished) return;
      wrong = new Set();
      for (const i of g.whites) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('kk.noErrors') : wrong.size === 1 ? t('kk.errorFound') : t('kk.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished || g.whites.some((i) => !vals[i])) return;
      if (isSolution(puz, vals)) {
        finished = true;
        sel = -1;
        render();
        consume(N, diff, pid);
        ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
      } else {
        message = { text: t('kk.fullButWrong') };
        render();
      }
    }

    // --- indices ---------------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('kk.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les chiffres justes posés par le joueur.
      const st = newState(puz);
      for (const i of g.whites) if (!isGiven(i) && vals[i] && vals[i] === sol[i]) st.cand[i] = bit(vals[i]);
      const last = sel >= 0 ? [row(sel), col(sel)] : null;
      // toutes les déductions disponibles : la plus facile, et à égalité la plus proche de la case touchée en dernier
      const plan = planHint({
        collect: () => allSteps(st, 4),
        apply: (s) => { for (const [i, m] of s.changes) st.cand[i] &= m; },
        fresh: (s) => s.changes.filter(([i, m]) => !isGiven(i) && single(m) && digitOf(m) !== vals[i]).map(([i, m]) => [i, digitOf(m)]),
        where: (s, f) => f.map(([i]) => [row(i), col(i)]),
        last,
      });
      let found = null;
      if (plan) {
        // on choisit la case de la déduction la plus proche de la dernière action
        const [i, d] = plan.fresh.reduce((best, x) => (!last || manhattan([row(x[0]), col(x[0])], last) < manhattan([row(best[0]), col(best[0])], last) ? x : best), plan.fresh[0]);
        found = { step: plan.step, i, d, prior: plan.prior, info: explain(plan.step, i, d, st) };
      } else {
        let k = -1;
        let bd = Infinity;
        for (const x of g.whites) {
          if (isGiven(x) || vals[x] === sol[x]) continue;
          const dd = last ? manhattan([row(x), col(x)], last) : 0;
          if (dd < bd) { bd = dd; k = x; }
        }
        if (k < 0) return;
        found = { step: { tech: 'search', focus: [k], runs: g.runOf[k].filter((r) => r >= 0) }, i: k, d: sol[k], prior: [], info: { r: row(k) + 1, c: col(k) + 1, d: sol[k] } };
      }
      hint = { ...found, revealed: false };
      sel = found.i;
      showHint();
    }
    /** Paramètres concrets du texte d'indice (ligne, colonne, somme, chiffres). */
    function explain(step, i, d, st) {
      const p = { r: row(i) + 1, c: col(i) + 1, d };
      const runOfBoth = (a, b) => g.runOf[a].find((ri) => ri >= 0 && g.runs[ri].cells.includes(b));
      const setRun = (ri) => {
        const run = g.runs[ri];
        p.dir = t(run.dir === 'h' ? 'kk.dir.h' : 'kk.dir.v');
        p.sum = run.sum;
        p.n = run.cells.length;
        return run;
      };
      if (step.tech === 'naked') {
        const f = step.focus[0];
        p.r0 = row(f) + 1;
        p.c0 = col(f) + 1;
        p.d0 = digitOf(st.cand[f]);
        setRun(runOfBoth(f, i) ?? g.runOf[i].find((ri) => ri >= 0));
      } else if (step.tech === 'combo' || step.tech === 'run') {
        const run = setRun(step.runs[0]);
        let mask = 0;
        for (const x of run.cells) mask |= step.changes.find(([y]) => y === x)?.[1] ?? st.cand[x];
        p.digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => mask & bit(k)).join(', ');
      } else if (step.tech.startsWith('trial')) {
        p.x = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => st.cand[i] & bit(k) && !(step.changes.find(([y]) => y === i)[1] & bit(k))).join(', ');
      }
      return p;
    }
    function showHint() {
      const hn = hint;
      if (hn.revealed) {
        message = {
          text: t('kk.hint.answer', { r: row(hn.i) + 1, c: col(hn.i) + 1, d: hn.d }),
          action: { label: t('kk.hint.place', { d: hn.d }), run: () => setValue(hn.i, hn.d) },
        };
      } else {
        let text = t(`kk.hint.${hn.step.tech}`, hn.info);
        const names = [...new Set(hn.prior.filter((p) => p !== hn.step.tech).map((p) => t(`kk.prior.${p}`)))];
        if (names.length) text += ' ' + t('kk.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- rendu -----------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const selRuns = sel >= 0 ? new Set(g.runOf[sel].filter((r) => r >= 0).flatMap((r) => g.runs[r].cells)) : null;
      const hintRuns = hint && !hint.revealed ? new Set((hint.step.runs ?? []).flatMap((r) => g.runs[r].cells)) : null;
      const focusSet = hint && !hint.revealed ? new Set(hint.step.focus ?? []) : null;
      const focusDigit = sel >= 0 ? vals[sel] : 0;
      for (const i of g.whites) {
        const c = cells[i];
        const v = vals[i];
        const cls = ['kk-cell'];
        if (isGiven(i)) cls.push('given');
        else if (v) cls.push('user');
        if (v) cls.push('has-val');
        if (i === sel) cls.push('sel');
        else if (focusDigit && v === focusDigit) cls.push('same');
        else if (selRuns?.has(i)) cls.push('peer');
        if ((mode === 'live' && !isGiven(i) && (isWrong(i) || isDup(i))) || wrong.has(i)) cls.push('bad');
        if (hintRuns?.has(i)) cls.push('hint-unit');
        if (focusSet?.has(i)) cls.push('hint-focus');
        if (hint?.revealed && hint.i === i) cls.push('hint-cell');
        c.el.className = cls.join(' ');
        c.val.textContent = v ? String(v) : '';
        for (let d = 1; d <= 9; d++) {
          const on = !v && notes[i] & bit(d);
          c.noteEls[d - 1].textContent = on ? String(d) : '';
          c.noteEls[d - 1].className = on && focusDigit === d ? 'hl' : '';
        }
        const pos = t('kk.cellAria', { r: row(i) + 1, c: col(i) + 1 });
        c.el.setAttribute('aria-label', `${pos}, ${v ? v + (isGiven(i) ? ', ' + t('kk.given') : '') : t('kk.empty')}`);
      }
      // sommes : vert quand la suite est complète et juste, rouge si dépassée (mode « direct »)
      const selRunIdx = sel >= 0 ? new Set(g.runOf[sel]) : new Set();
      const status = new Map();
      g.runs.forEach((run) => {
        const info = runInfo(run);
        let s = '';
        if (info.full && info.sum === run.sum && !run.cells.some(isDup)) s = 'met';
        else if (mode === 'live' && (info.sum > run.sum || (info.full && info.sum !== run.sum))) s = 'over';
        status.set(run, s);
        const c = cells[run.clue];
        const el = run.dir === 'h' ? c.rEl : c.dEl;
        el.className = (run.dir === 'h' ? 'kk-r ' : 'kk-d ') + s + (selRunIdx.has(g.runs.indexOf(run)) ? ' on' : '');
      });
      for (let i = 0; i < NN; i++) {
        if (isWhite(i)) continue;
        const parts = [];
        if (puz.right[i]) parts.push(t('kk.clueRight', { n: puz.right[i] }));
        if (puz.down[i]) parts.push(t('kk.clueDown', { n: puz.down[i] }));
        cells[i].el.setAttribute('aria-label', parts.join(', ') || t('kk.black'));
      }
      root.classList.toggle('kk-notes-mode', notesMode);
      tools.notes.setAttribute('aria-pressed', String(notesMode));
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.erase.disabled = finished;
      tools.auto.disabled = finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      for (const k of pad.children) k.disabled = finished;
      msgEl.replaceChildren();
      if (message) {
        msgEl.append(h('span', {}, message.text));
        if (message.action) msgEl.append(h('button', { class: 'btn', onClick: message.action.run }, message.action.label));
      }
    }

    // --- clavier ---------------------------------------------------------------
    function onKey(e) {
      if (document.querySelector('.sheet-backdrop') || e.metaKey || e.altKey) return;
      const k = e.key;
      if (e.ctrlKey && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.ctrlKey && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (e.ctrlKey || finished) return;
      if (/^[1-9]$/.test(k)) return applyDigit(+k);
      if (k === 'Backspace' || k === 'Delete' || k === '0') return erase();
      if (k === 'n' || k === 'N') return toggleNotesMode();
      const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      if (move) {
        e.preventDefault();
        let r = sel < 0 ? 0 : row(sel);
        let c = sel < 0 ? 0 : col(sel);
        if (sel < 0) { sel = g.whites[0]; return render(); }
        for (;;) {
          r += move[0];
          c += move[1];
          if (r < 0 || r >= N || c < 0 || c >= N) return;
          if (isWhite(r * N + c)) { sel = r * N + c; return render(); }
        }
      }
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
