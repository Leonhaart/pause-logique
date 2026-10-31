// Star Battle : interface. Une étoile par ligne, colonne et région colorée, jamais deux étoiles voisines.
import { h, svgEl } from '../../core/dom.js';
import { storage } from '../../core/storage.js';
import { createRng } from '../../core/rng.js';
import { History, toolButton } from '../../ui/kit.js';
import { iconEl } from '../../ui/components.js';
import { geo, newState, place, allSteps, unitsOf } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'M12 2.800l2.900 6 6.600.9-4.800 4.600 1.200 6.500L12 17.600l-5.900 3.200 1.200-6.500L2.500 9.700l6.600-.9z';
const PEN_COLORS = ['ink', 'red', 'blue'];

/** Teintes réparties sur le cercle ; on cherche l'attribution qui éloigne le plus les régions voisines. */
function assignHues(reg, N, rng) {
  const adj = [];
  const seen = new Set();
  const link = (a, b) => {
    if (a === b) return;
    const k = a < b ? a * 64 + b : b * 64 + a;
    if (!seen.has(k)) { seen.add(k); adj.push([a, b]); }
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (c + 1 < N) link(reg[r * N + c], reg[r * N + c + 1]);
      if (r + 1 < N) link(reg[r * N + c], reg[(r + 1) * N + c]);
    }
  }
  const dist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, N - d); };
  let best = null;
  let bestScore = -1;
  for (let k = 0; k < 400; k++) {
    const slot = rng.shuffle([...Array(N).keys()]);
    let min = N;
    let sum = 0;
    for (const [a, b] of adj) {
      const d = dist(slot[a], slot[b]);
      min = Math.min(min, d);
      sum += d;
    }
    const score = min * 1000 + sum;
    if (score > bestScore) { bestScore = score; best = slot; }
  }
  return best.map((s) => ({ hue: Math.round((s * 360) / N + 8) % 360, alt: s % 2 }));
}

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 8;
    const { NN, row, col, neigh } = geo(N);
    const saved = ctx.restore;
    const { pid, reg, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const isSol = (i) => sol[row[i]] === col[i];
    const unitCellsOf = (() => {
      const st = newState(reg, N);
      return st.unitCells;
    })();
    const colors = assignHues(reg, N, createRng(`col:${ctx.seed}`));

    // marks : 0 vide, 1 croix posée à la main, 2 étoile
    const marks = new Uint8Array(NN);
    const snapshot = () => Array.from(marks).join('');
    const load = (snap) => { for (let i = 0; i < NN; i++) marks[i] = +snap[i]; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    let strokes = saved?.pen ? saved.pen.map((s) => ({ color: s.color, pts: s.pts.slice() })) : [];
    let autoX = storage.get('sb:autoX', true);
    let starFirst = storage.get('sb:starFirst', false);
    let penOn = false;
    let penColor = 'ink';
    let wrong = new Set();
    let hint = null; // { step, revealed }
    let message = null;
    let finished = false;
    let sel = -1;

    // --- DOM --------------------------------------------------------------
    const cells = [];
    const board = h('div', { class: 'sb-board', role: 'grid', 'aria-label': t('game.starbattle.name') });
    board.style.setProperty('--n', N);
    for (let i = 0; i < NN; i++) {
      const star = svgEl(`<svg viewBox="0 0 24 24" class="sb-star" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`);
      const cross = svgEl('<svg viewBox="0 0 24 24" class="sb-cross" aria-hidden="true"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/></svg>');
      const g = reg[i];
      const r = row[i];
      const c = col[i];
      const edge = (j, ok) => (!ok || reg[j] !== g);
      const el = h('div', {
        class: 'sb-cell', role: 'gridcell', tabindex: '-1', dataset: { i },
      }, star, cross);
      el.style.setProperty('--h', colors[g].hue);
      el.style.setProperty('--alt', colors[g].alt);
      const edges = [edge(i - N, r > 0) ? 'et' : '', edge(i + N, r < N - 1) ? 'eb' : '', edge(i - 1, c > 0) ? 'el' : '', edge(i + 1, c < N - 1) ? 'er' : ''].filter(Boolean);
      el.classList.add(...edges);
      board.append(el);
      cells.push({ el, edges });
    }
    const penLayer = svgEl(`<svg class="sb-pen-layer" viewBox="0 0 ${N} ${N}" preserveAspectRatio="none" aria-hidden="true"></svg>`);
    const boardWrap = h('div', { class: 'sb-board-wrap' }, board, penLayer);
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });

    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      starFirst: toolButton({ icon: 'star', label: t('tool.starFirst'), title: t('tool.starFirstTitle'), toggle: true, onClick: () => { starFirst = !starFirst; storage.set('sb:starFirst', starFirst); render(); } }),
      autoX: toolButton({ icon: 'cross', label: t('tool.autoX'), title: t('tool.autoXTitle'), toggle: true, onClick: () => { autoX = !autoX; storage.set('sb:autoX', autoX); hint = null; render(); } }),
      pen: toolButton({ icon: 'pen', label: t('tool.pen'), title: t('tool.penTitle'), toggle: true, onClick: () => { penOn = !penOn; render(); } }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const toolbar = h('div', { class: 'tools' }, Object.values(tools));

    const penBar = h('div', { class: 'sb-penbar', hidden: true },
      h('div', { class: 'sb-colors', role: 'radiogroup', 'aria-label': t('pen.color') },
        PEN_COLORS.map((c) => h('button', {
          class: `sb-color sb-color-${c}`, role: 'radio', 'aria-label': c, 'data-c': c,
          onClick: () => { penColor = c; render(); },
        }))),
      h('button', { class: 'btn', onClick: () => { strokes.pop(); persist(); drawPen(); } }, t('pen.undo')),
      h('button', { class: 'btn', onClick: () => { strokes = []; persist(); drawPen(); } }, t('pen.clear')));

    const root = h('div', { class: 'sb' }, boardWrap, msgEl, penBar, toolbar);
    container.append(root);

    // --- logique d'affichage ---------------------------------------------
    function derivedCrosses() {
      const d = new Uint8Array(NN);
      if (!autoX) return d;
      for (let s = 0; s < NN; s++) {
        if (marks[s] !== 2) continue;
        for (const u of unitsOf({ N, reg }, s)) for (const c of unitCellsOf[u]) if (c !== s) d[c] = 1;
        for (const nb of neigh[s]) d[nb] = 1;
      }
      return d;
    }
    const visual = (i, d) => (marks[i] === 2 ? 2 : marks[i] === 1 || d[i] ? 1 : 0);

    function nextMark(i, d) {
      const v = visual(i, d);
      if (v === 2) return starFirst && !d[i] ? 1 : 0;
      if (v === 1) return 2;
      return starFirst ? 2 : 1;
    }

    // --- historique -------------------------------------------------------
    function persist() {
      ctx.save({ ...hist.dump(), pid, pen: strokes });
    }
    let lastCell = -1; // dernière case modifiée par le joueur
    function commit() {
      wrong = new Set();
      hint = null;
      message = null;
      const before = String(hist.cur);
      const now = snapshot();
      for (let i = 0; i < NN; i++) if (before[i] !== now[i]) { lastCell = i; break; }
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

    // --- vérification et fin ----------------------------------------------
    const isWrong = (i) => (marks[i] === 2 && !isSol(i)) || (marks[i] === 1 && isSol(i));
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let i = 0; i < NN; i++) if (isWrong(i)) wrong.add(i);
      message = { text: wrong.size === 0 ? t('sb.noErrors') : wrong.size === 1 ? t('sb.errorFound') : t('sb.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished) return;
      let stars = 0;
      for (let i = 0; i < NN; i++) if (marks[i] === 2) stars++;
      if (stars !== N) return;
      let ok = true;
      for (let i = 0; i < NN; i++) if (marks[i] === 2 && !isSol(i)) ok = false;
      if (ok) {
        finished = true;
        penOn = false;
        render();
        consume(N, diff, pid);
        ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
      } else {
        message = { text: t('sb.fullButWrong') };
        render();
      }
    }

    // --- indices ----------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) {
        message = { text: t('sb.hintsOff') };
        return render();
      }
      if (hint && !hint.revealed) {
        hint.revealed = true;
        return showHint();
      }
      // Le joueur est supposé avoir raison : on ne retient que ses étoiles justes et ses croix justes.
      const d = derivedCrosses();
      const st = newState(reg, N);
      for (let i = 0; i < NN; i++) if (marks[i] === 2 && isSol(i)) place(st, i);
      for (let i = 0; i < NN; i++) if (st.cs[i] === 1 && visual(i, d) === 1 && !isSol(i)) st.cs[i] = 0;
      const rcOf = (i) => [Math.floor(i / N), i % N];
      const last = lastCell >= 0 ? rcOf(lastCell) : null;
      const seen = (c) => visual(c, d) === 1;
      const plan = st.stars < N ? planHint({
        collect: () => allSteps(st, 5),
        apply: (s) => { if (s.place != null) place(st, s.place); else for (const c of s.elim) if (st.cs[c] === 1) st.cs[c] = 0; },
        fresh: (s) => (s.place != null ? (marks[s.place] === 2 ? [] : [s.place]) : s.elim.filter((c) => !seen(c))),
        where: (s, f) => f.map(rcOf),
        last,
      }) : null;
      let step = plan?.step ?? null;
      if (plan) step = { ...step, prior: plan.prior, fresh: plan.fresh };
      if (!step && st.stars < N) {
        const cand = [...Array(NN).keys()].filter((k) => isSol(k) && marks[k] !== 2);
        cand.sort((x, y) => (last ? manhattan(rcOf(x), last) - manhattan(rcOf(y), last) : 0));
        step = { tech: 'search', place: cand[0], units: [], prior: [], fresh: [cand[0]] };
      }
      if (!step) return;
      hint = { step, revealed: false };
      showHint();
    }
    /** Nom d'une unité (0..N-1 lignes, N..2N-1 colonnes, ensuite régions) pour les textes. */
    function unitName(u) {
      return u < N ? t('sb.u.row', { n: u + 1 }) : u < 2 * N ? t('sb.u.col', { n: u - N + 1 }) : t('sb.u.reg');
    }
    function unitList(us) {
      const names = us.map(unitName);
      return names.join(', ');
    }
    function showHint() {
      const s = hint.step;
      if (hint.revealed) {
        if (s.place != null) {
          message = { text: t('sb.hint.revealStar'), action: { label: t('sb.hint.placeStar'), run: () => { marks[s.place] = 2; commit(); } } };
        } else {
          message = { text: t('sb.hint.revealElim'), action: { label: t('sb.hint.markCrosses'), run: () => { for (const c of s.elim) if (marks[c] === 0) marks[c] = 1; commit(); } } };
        }
      } else {
        const k = s.tech.startsWith('set') ? +s.tech.slice(3) : 0;
        const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
        const p = { k, units: cap(unitList(s.units ?? [])), targets: unitList(s.targets ?? []) };
        let text = s.tech === 'single' ? t('sb.hint.single', p)
          : k === 1 ? t('sb.hint.set1', p)
          : k > 1 ? t('sb.hint.setN', p)
          : s.tech.startsWith('trial') ? t('sb.hint.trial')
          : t('sb.hint.search');
        if (s.prior?.length) text += ' ' + t('sb.hint.prior');
        message = { text, action: { label: t('sb.hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie : appui, glisser pour tracer des croix ----------------------
    const cellAt = (e) => {
      const rect = board.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
      return r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1;
    };
    let drag = null; // { start, mode: 'x' | 'erase' | null, moved, touched:Set }
    board.addEventListener('pointerdown', (e) => {
      if (finished || penOn || e.button > 0) return;
      const i = cellAt(e);
      if (i < 0) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      const d = derivedCrosses();
      const v = visual(i, d);
      drag = { start: i, mode: v === 0 ? 'x' : marks[i] === 1 ? 'erase' : null, moved: false, last: i, changed: false };
      sel = i;
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const i = cellAt(e);
      if (i < 0 || i === drag.last) return;
      drag.last = i;
      if (!drag.mode) return;
      const d = derivedCrosses();
      const apply = (k) => {
        if (drag.mode === 'x' && marks[k] === 0 && !d[k]) { marks[k] = 1; drag.changed = true; }
        else if (drag.mode === 'erase' && marks[k] === 1) { marks[k] = 0; drag.changed = true; }
      };
      if (!drag.moved) { drag.moved = true; apply(drag.start); }
      apply(i);
      render();
    });
    const endDrag = (e) => {
      if (!drag) return;
      const dd = drag;
      drag = null;
      if (!dd.moved) {
        const d = derivedCrosses();
        marks[dd.start] = nextMark(dd.start, d);
        commit();
      } else if (dd.changed) commit();
      else render();
    };
    board.addEventListener('pointerup', endDrag);
    board.addEventListener('pointercancel', () => { drag = null; render(); });

    // --- stylo ------------------------------------------------------------
    let stroke = null;
    const pt = (e) => {
      const rect = board.getBoundingClientRect();
      return [Math.round(((e.clientX - rect.left) / rect.width) * N * 20) / 20, Math.round(((e.clientY - rect.top) / rect.height) * N * 20) / 20];
    };
    boardWrap.addEventListener('pointerdown', (e) => {
      if (!penOn || e.button > 0) return;
      e.preventDefault();
      boardWrap.setPointerCapture?.(e.pointerId);
      stroke = { color: penColor, pts: [pt(e)] };
      strokes.push(stroke);
      drawPen();
    });
    boardWrap.addEventListener('pointermove', (e) => {
      if (!stroke) return;
      const p = pt(e);
      const last = stroke.pts[stroke.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.08) return;
      stroke.pts.push(p);
      drawPen();
    });
    const endStroke = () => {
      if (!stroke) return;
      if (stroke.pts.length < 2) stroke.pts.push([stroke.pts[0][0] + 0.01, stroke.pts[0][1]]);
      stroke = null;
      persist();
      drawPen();
    };
    boardWrap.addEventListener('pointerup', endStroke);
    boardWrap.addEventListener('pointercancel', endStroke);
    function drawPen() {
      penLayer.replaceChildren(...strokes.map((s) => {
        const p = document.createElementNS(SVG_NS, 'polyline');
        p.setAttribute('points', s.pts.map((q) => q.join(',')).join(' '));
        p.setAttribute('class', `sb-stroke sb-stroke-${s.color}`);
        return p;
      }));
    }

    // --- rendu ------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const d = derivedCrosses();
      const s = hint?.step;
      const unitSet = new Set();
      const targetSet = new Set();
      if (s && !hint.revealed) {
        for (const u of s.units ?? []) for (const c of unitCellsOf[u]) unitSet.add(c);
        for (const u of s.targets ?? []) for (const c of unitCellsOf[u]) targetSet.add(c);
      }
      const hintCell = s ? (s.place != null ? s.place : s.tech.startsWith('trial') ? s.elim[0] : -1) : -1;
      const elimSet = s && hint.revealed && s.elim ? new Set(s.elim) : null;
      for (let i = 0; i < NN; i++) {
        const v = visual(i, d);
        const cls = ['sb-cell', ...cells[i].edges];
        if (v === 2) cls.push('has-star');
        else if (v === 1) cls.push('has-cross');
        if (marks[i] === 1 && !d[i]) cls.push('manual');
        if ((mode === 'live' && isWrong(i)) || wrong.has(i)) cls.push('bad');
        if (unitSet.has(i)) cls.push('hint-unit');
        if (targetSet.has(i)) cls.push('hint-target');
        if (i === hintCell && (hint.revealed || s.tech.startsWith('trial'))) cls.push('hint-cell');
        if (elimSet && elimSet.has(i)) cls.push('hint-elim');
        if (i === sel && !finished) cls.push('sel');
        cells[i].el.className = cls.join(' ');
        cells[i].el.setAttribute('aria-label', t('sb.cellAria', { r: row[i] + 1, c: col[i] + 1, g: reg[i] + 1 }) + ', ' + t(v === 2 ? 'sb.star' : v === 1 ? 'sb.cross' : 'sb.empty'));
      }
      tools.undo.disabled = !hist.canUndo || finished;
      tools.redo.disabled = !hist.canRedo || finished;
      tools.hint.disabled = finished || !ctx.settings().hints;
      tools.check.hidden = mode !== 'ask';
      tools.autoX.setAttribute('aria-pressed', String(autoX));
      tools.starFirst.setAttribute('aria-pressed', String(starFirst));
      tools.pen.setAttribute('aria-pressed', String(penOn));
      root.classList.toggle('pen-on', penOn);
      penBar.hidden = !penOn;
      penBar.querySelectorAll('.sb-color').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.c === penColor)));
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
        const r = Math.min(N - 1, Math.max(0, row[from] + move[0]));
        const c = Math.min(N - 1, Math.max(0, col[from] + move[1]));
        sel = r * N + c;
        return render();
      }
      if (sel < 0) return;
      if (k === ' ' || k === 'Enter') { e.preventDefault(); marks[sel] = nextMark(sel, derivedCrosses()); return commit(); }
      if (k === 's' || k === 'S') { marks[sel] = marks[sel] === 2 ? 0 : 2; return commit(); }
      if (k === 'x' || k === 'X') { marks[sel] = marks[sel] === 1 ? 0 : 1; return commit(); }
      if (k === 'Backspace' || k === 'Delete') { marks[sel] = 0; return commit(); }
    }
    document.addEventListener('keydown', onKey);
    const unsub = ctx.onSettings(() => render());

    drawPen();
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
