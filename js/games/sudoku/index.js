import { h } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { parse, ROW, COL, BOX, PEERS, UNITS, unitKind, candidates, initState, applyStep, allSteps, popcnt } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';

const bit = (d) => 1 << (d - 1);

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const { puzzle, solution } = puzzleFor(ctx.level, ctx.rng);
    const given = parse(puzzle);
    const sol = parse(solution);
    const vals = Int8Array.from(given);
    const notes = new Uint16Array(81);

    // --- état et historique -------------------------------------------------
    const snapshot = () => Array.from(vals).join('') + '|' + Array.from(notes, (m) => m.toString(36)).join(',');
    const load = (snap) => {
      const [v, n] = snap.split('|');
      for (let i = 0; i < 81; i++) vals[i] = +v[i];
      n.split(',').forEach((m, i) => (notes[i] = parseInt(m, 36) || 0));
    };
    const saved = ctx.restore;
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let sel = -1;
    let lock = 0; // chiffre verrouillé (mode « chiffre d'abord »)
    let notesMode = false;
    let wrong = new Set(); // cases signalées par « Vérifier »
    let hint = null; // { i, d, tech, unit, prior, revealed }
    let message = null; // { text, action? }
    let finished = false;

    // --- construction du DOM ------------------------------------------------
    const cells = [];
    const board = h('div', { class: 'sd-board', role: 'grid', 'aria-label': t('game.sudoku.name') });
    for (let i = 0; i < 81; i++) {
      const noteEls = Array.from({ length: 9 }, () => h('span'));
      const val = h('span', { class: 'sd-val' });
      const el = h(
        'div',
        { class: `sd-cell r${ROW[i]} c${COL[i]}`, role: 'gridcell', dataset: { i } },
        h('div', { class: 'sd-notes', 'aria-hidden': 'true' }, noteEls),
        val,
      );
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        select(i);
        if (lock) applyDigit(lock);
      });
      board.append(el);
      cells.push({ el, val, noteEls });
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
    const toolbar = h('div', { class: 'tools' }, Object.values(tools));

    const keys = [];
    const pad = h('div', { class: 'sd-pad' });
    for (let d = 1; d <= 9; d++) {
      const small = h('small');
      const btn = h('button', { class: 'sd-key', 'aria-pressed': 'false', 'aria-label': String(d), title: t('sudoku.lockTip') }, String(d), small);
      let timer = null;
      let longPressed = false;
      btn.addEventListener('pointerdown', () => {
        longPressed = false;
        timer = setTimeout(() => {
          longPressed = true;
          lock = lock === d ? 0 : d;
          navigator.vibrate?.(15);
          render();
        }, 450);
      });
      const cancel = () => clearTimeout(timer);
      btn.addEventListener('pointerup', cancel);
      btn.addEventListener('pointerleave', cancel);
      btn.addEventListener('pointercancel', cancel);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        if (longPressed) return;
        if (lock) {
          lock = lock === d ? 0 : d; // un tap sur un chiffre verrouillé change de chiffre
          return render();
        }
        applyDigit(d);
      });
      pad.append(btn);
      keys.push({ btn, small });
    }

    const root = h('div', { class: 'sd' }, board, msgEl, toolbar, pad);
    container.append(root);

    // --- actions ------------------------------------------------------------
    function commit() {
      wrong = new Set();
      hint = null;
      message = null;
      const changed = hist.commit(snapshot());
      if (changed) persist();
      render();
      checkComplete();
    }
    function persist() {
      ctx.save(hist.dump());
    }
    function select(i) {
      sel = i;
      render();
    }
    function setValue(i, d) {
      if (given[i] || finished) return;
      vals[i] = d;
      notes[i] = 0;
      for (const p of PEERS[i]) if (!given[p] && !vals[p]) notes[p] &= ~bit(d); // nettoyage des notes voisines
      commit();
    }
    function toggleNote(i, d) {
      if (given[i] || vals[i] || finished) return;
      notes[i] ^= bit(d);
      commit();
    }
    function erase() {
      if (sel < 0 || given[sel] || finished) return;
      if (vals[sel]) vals[sel] = 0;
      else notes[sel] = 0;
      commit();
    }
    function applyDigit(d) {
      if (sel < 0 || finished) return;
      if (given[sel]) return;
      if (notesMode) toggleNote(sel, d);
      else if (vals[sel] === d) erase();
      else setValue(sel, d);
    }
    function toggleNotesMode() {
      notesMode = !notesMode;
      render();
    }
    function autoNotes() {
      if (finished) return;
      const g = Int8Array.from(vals);
      const c = candidates(g);
      for (let i = 0; i < 81; i++) notes[i] = g[i] ? 0 : c[i];
      commit();
    }
    function undo() {
      const s = hist.undo();
      if (s == null) return;
      load(s);
      wrong = new Set();
      hint = null;
      message = null;
      persist();
      render();
    }
    function redo() {
      const s = hist.redo();
      if (s == null) return;
      load(s);
      wrong = new Set();
      hint = null;
      message = null;
      persist();
      render();
    }

    // --- vérification et fin ------------------------------------------------
    const isWrong = (i) => !given[i] && vals[i] !== 0 && vals[i] !== sol[i];
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < 81; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('sudoku.noErrors') : wrong.size === 1 ? t('sudoku.errorFound') : t('sudoku.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished || vals.some((v) => !v)) return;
      if (vals.every((v, i) => v === sol[i])) {
        finished = true;
        sel = -1;
        render();
        ctx.complete();
      } else {
        message = { text: t('sudoku.fullButWrong') };
        render();
      }
    }

    // --- indices ------------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) {
        message = { text: t('sudoku.hintsOff') };
        return render();
      }
      if (hint && !hint.revealed) {
        hint.revealed = true;
        return showHint();
      }
      const g = Int8Array.from(given);
      for (let i = 0; i < 81; i++) if (!given[i] && vals[i] === sol[i]) g[i] = vals[i]; // on ignore les erreurs du joueur
      const st = initState(g);
      const last = sel >= 0 ? [ROW[sel], COL[sel]] : null;
      // toutes les déductions disponibles : la plus facile, et à égalité la plus proche de la case touchée en dernier
      const plan = planHint({
        collect: () => allSteps(st, 3),
        apply: (step) => applyStep(st, step),
        fresh: (step) => (step.place && vals[step.place.i] !== step.place.d ? [step.place] : []),
        where: (step) => [[ROW[step.place.i], COL[step.place.i]]],
        last,
      });
      let found = plan && { i: plan.step.place.i, d: plan.step.place.d, tech: plan.step.tech, unit: plan.step.unit ?? null, prior: plan.prior };
      if (!found) {
        const c = candidates(g);
        let best = -1;
        let bestKey = null;
        for (let i = 0; i < 81; i++) {
          if (g[i]) continue;
          const key = [popcnt(c[i]), last ? manhattan([ROW[i], COL[i]], last) : 0];
          if (best < 0 || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = i; bestKey = key; }
        }
        if (best < 0) return;
        found = { i: best, d: sol[best], tech: 'search', unit: null, prior: [] };
      }
      hint = { ...found, revealed: false };
      sel = found.i;
      showHint();
    }
    function showHint() {
      const hn = hint;
      const r = ROW[hn.i] + 1;
      const c = COL[hn.i] + 1;
      const cell = t('sudoku.cell', { r, c });
      if (hn.revealed) {
        message = {
          text: t('hint.answer', { cell, d: hn.d }),
          action: { label: t('hint.place', { d: hn.d }), run: () => setValue(hn.i, hn.d) },
        };
      } else {
        let text;
        if (hn.tech === 'nakedSingle') text = t('hint.nakedSingle', { r, c, d: hn.d });
        else if (hn.tech === 'hiddenSingle') {
          const kind = unitKind(hn.unit);
          const params = { d: hn.d, r, c, u: kind === 'row' ? r : kind === 'col' ? c : t(`sudoku.box.${BOX[hn.i]}`) };
          text = t(`hint.hiddenSingle.${kind}`, params);
        } else text = t('hint.search', { r, c });
        if (hn.prior.length) {
          const names = [...new Set(hn.prior.filter((p) => p !== 'nakedSingle' && p !== 'hiddenSingle').map((p) => t(`technique.${p}`)))];
          if (names.length) text += ' ' + t('hint.prior', { list: names.join(', ') });
        }
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- rendu --------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const selVal = sel >= 0 ? vals[sel] : 0;
      const focusDigit = lock || selVal;
      const peerSet = sel >= 0 ? new Set(PEERS[sel]) : null;
      const unitCells = hint && hint.unit != null && hint.tech === 'hiddenSingle' ? new Set(UNITS[hint.unit]) : null;
      const counts = new Array(10).fill(0);
      for (let i = 0; i < 81; i++) {
        const v = vals[i];
        counts[v]++;
        const c = cells[i];
        const cls = ['sd-cell', `r${ROW[i]}`, `c${COL[i]}`];
        if (given[i]) cls.push('given');
        else if (v) cls.push('user');
        if (v) cls.push('has-val');
        if (i === sel) cls.push('sel');
        else if (focusDigit && v === focusDigit) cls.push('same');
        else if (peerSet && peerSet.has(i)) cls.push('peer');
        if ((mode === 'live' && isWrong(i)) || wrong.has(i)) cls.push('bad');
        if (unitCells && unitCells.has(i)) cls.push('hint-unit');
        if (hint && hint.i === i) cls.push('hint-cell');
        c.el.className = cls.join(' ');
        c.val.textContent = v ? String(v) : '';
        for (let d = 1; d <= 9; d++) {
          const span = c.noteEls[d - 1];
          const on = !v && notes[i] & bit(d);
          span.textContent = on ? String(d) : '';
          span.className = on && focusDigit === d ? 'hl' : '';
        }
        const pos = t('sudoku.cellAria', { r: ROW[i] + 1, c: COL[i] + 1 });
        c.el.setAttribute('aria-label', `${pos}, ${v ? v + (given[i] ? ', ' + t('sudoku.given') : '') : t('sudoku.empty')}`);
      }
      keys.forEach(({ btn, small }, k) => {
        const d = k + 1;
        const left = 9 - counts[d];
        small.textContent = left > 0 ? String(left) : '';
        btn.disabled = left <= 0 && lock !== d;
        btn.setAttribute('aria-pressed', String(lock === d));
      });
      root.classList.toggle('sd-notes-mode', notesMode);
      tools.notes.setAttribute('aria-pressed', String(notesMode));
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.erase.disabled = finished;
      tools.auto.disabled = finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      msgEl.replaceChildren();
      if (message) {
        msgEl.append(h('span', {}, message.text));
        if (message.action) msgEl.append(h('button', { class: 'btn', onClick: message.action.run }, message.action.label));
      }
    }

    // --- clavier ------------------------------------------------------------
    function onKey(e) {
      if (document.querySelector('.sheet-backdrop') || e.metaKey || e.altKey) return;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (e.ctrlKey && k.toLowerCase() === 'y') {
        e.preventDefault();
        return redo();
      }
      if (e.ctrlKey) return;
      if (/^[1-9]$/.test(k)) return applyDigit(+k);
      if (k === 'Backspace' || k === 'Delete' || k === '0') return erase();
      if (k === 'n' || k === 'N') return toggleNotesMode();
      const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
      if (move) {
        e.preventDefault();
        const from = sel < 0 ? 40 : sel;
        const r = ROW[from] + (move === -9 ? -1 : move === 9 ? 1 : 0);
        const c = COL[from] + (move === -1 ? -1 : move === 1 ? 1 : 0);
        if (r >= 0 && r < 9 && c >= 0 && c < 9) select(r * 9 + c);
      }
    }
    document.addEventListener('keydown', onKey);
    const unsub = ctx.onSettings(() => render());

    render();
    return {
      destroy() {
        document.removeEventListener('keydown', onKey);
        unsub();
        root.remove();
      },
    };
  },
};
