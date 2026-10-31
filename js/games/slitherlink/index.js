// Slitherlink : interface. Appui sur un côté : trait, croix, vide. Glisser pour tracer plusieurs côtés.
import { h, svgEl } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { geoOf, newState, allSteps, isSolution, isLoop } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

const PAD = 0.35;

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 7;
    const saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const g = geoOf(N);
    const { E, HN } = g;
    const NN = N * N;

    // marks : 0 vide, 1 trait, 2 croix
    const marks = new Int8Array(E);
    const snapshot = () => Array.from(marks).join('');
    const load = (snap) => { for (let k = 0; k < E; k++) marks[k] = +snap[k] || 0; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved && typeof saved.snap === 'string' && saved.snap.length === E) load(hist.cur);

    let wrong = new Set();
    let hint = null; // { step, edges:[[k,v]], prior, revealed }
    let message = null;
    let finished = false;
    let lastEdge = -1; // dernier côté touché par le joueur

    // --- géométrie des arêtes -------------------------------------------------
    const seg = (k) => {
      if (k < HN) { const r = Math.floor(k / N); const c = k % N; return [c, r, c + 1, r]; }
      const q = k - HN;
      const r = Math.floor(q / (N + 1));
      const c = q % (N + 1);
      return [c, r, c, r + 1];
    };

    // --- DOM ------------------------------------------------------------------
    let svg = '';
    for (let i = 0; i < NN; i++) svg += `<rect class="sl-fill" x="${i % N}" y="${Math.floor(i / N)}" width="1" height="1"/>`;
    let guides = '';
    let edgesSvg = '';
    let ghosts = '';
    let crosses = '';
    for (let k = 0; k < E; k++) {
      const [x1, y1, x2, y2] = seg(k);
      guides += `<line class="sl-guide" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      ghosts += `<line class="sl-ghost" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      edgesSvg += `<line class="sl-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      crosses += `<path class="sl-x" d="M${mx - 0.11} ${my - 0.11}l0.22 0.22M${mx + 0.11} ${my - 0.11}l-0.22 0.22"/>`;
    }
    let clues = '';
    for (let i = 0; i < NN; i++) {
      if (puz.clue[i] >= 0) clues += `<text class="sl-clue" x="${(i % N) + 0.5}" y="${Math.floor(i / N) + 0.69}">${puz.clue[i]}</text>`;
    }
    let halos = '';
    let dots = '';
    for (let v = 0; v < g.V; v++) {
      const x = v % (N + 1);
      const y = Math.floor(v / (N + 1));
      halos += `<circle class="sl-halo" cx="${x}" cy="${y}" r="0.24"/>`;
      dots += `<circle class="sl-dot" cx="${x}" cy="${y}" r="0.07"/>`;
    }
    const vb = `${-PAD} ${-PAD} ${N + 2 * PAD} ${N + 2 * PAD}`;
    const svgNode = svgEl(
      `<svg class="sl-svg" viewBox="${vb}" role="img" aria-label="${t('game.slitherlink.name')}"><g>${svg}</g><g>${guides}</g><g>${halos}</g><g>${ghosts}</g><g>${edgesSvg}</g><g>${crosses}</g><g>${clues}</g><g>${dots}</g></svg>`,
    );
    const groups = svgNode.querySelectorAll(':scope > g');
    const fillEls = [...groups[0].children];
    const haloEls = [...groups[2].children];
    const ghostEls = [...groups[3].children];
    const edgeEls = [...groups[4].children];
    const crossEls = [...groups[5].children];
    const clueCells = [];
    for (let i = 0; i < NN; i++) if (puz.clue[i] >= 0) clueCells.push(i);
    const clueEls = new Map([...groups[6].children].map((el, x) => [clueCells[x], el]));
    const dotEls = [...groups[7].children];

    const board = h('div', { class: 'sl-board' }, svgNode);
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });
    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const root = h('div', { class: 'sl' }, h('div', { class: 'sl-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)));
    container.append(root);

    // --- historique -------------------------------------------------------------
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

    // --- vérification et fin -----------------------------------------------------
    const isWrong = (k) => (marks[k] === 1 && sol[k] !== 1) || (marks[k] === 2 && sol[k] === 1);
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let k = 0; k < E; k++) if (isWrong(k)) wrong.add(k);
      message = { text: wrong.size === 0 ? t('sl.noErrors') : wrong.size === 1 ? t('sl.errorFound') : t('sl.errorsFound', { n: wrong.size }) };
      render();
    }
    const lineArr = () => Int8Array.from(marks, (m) => (m === 1 ? 1 : 0));
    function checkComplete() {
      if (finished) return;
      const lines = lineArr();
      if (isSolution(puz, lines)) {
        finished = true;
        render();
        consume(N, diff, pid);
        ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
      } else if (isLoop(puz, lines)) {
        message = { text: t('sl.loopWrong') };
        render();
      }
    }

    // --- indices -----------------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('sl.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les traits justes et les croix justes posés par le joueur.
      const st = newState(puz);
      for (let k = 0; k < E; k++) {
        if (marks[k] === 1 && sol[k] === 1) st.e[k] = 1;
        else if (marks[k] === 2 && sol[k] !== 1) st.e[k] = 2;
      }
      const mid = (k) => { const [x1, y1, x2, y2] = seg(k); return [(y1 + y2) / 2, (x1 + x2) / 2]; };
      const last = lastEdge >= 0 ? mid(lastEdge) : null;
      // toutes les déductions disponibles : la plus facile, et à égalité la plus proche du dernier côté touché
      const plan = planHint({
        collect: () => allSteps(st, 3),
        apply: (s) => { for (const [k, v] of s.changes) st.e[k] = v; },
        fresh: (s) => s.changes.filter(([k, v]) => marks[k] !== v),
        where: (s, f) => f.map(([k]) => mid(k)),
        last,
      });
      let found = null;
      if (plan) found = { step: plan.step, edges: plan.fresh, prior: plan.prior, info: explain(plan.step, plan.fresh, st) };
      else {
        let k = -1;
        let bd = Infinity;
        for (let x = 0; x < E; x++) {
          if (!(sol[x] === 1 ? marks[x] !== 1 : marks[x] === 1)) continue;
          const dd = last ? manhattan(mid(x), last) : 0;
          if (dd < bd) { bd = dd; k = x; }
        }
        if (k < 0) return;
        found = { step: { tech: 'search', changes: [[k, sol[k] === 1 ? 1 : 2]] }, edges: [[k, sol[k] === 1 ? 1 : 2]], prior: [], info: {} };
      }
      hint = { ...found, revealed: false };
      showHint();
    }
    /** « au-dessus de la case ligne 3, colonne 4 » : place concrète d'un côté. */
    function sideOf(k) {
      if (k < HN) {
        const r = Math.floor(k / N);
        const c = k % N;
        return r < N ? t('sl.side.top', { r: r + 1, c: c + 1 }) : t('sl.side.bottom', { r, c: c + 1 });
      }
      const q = k - HN;
      const r = Math.floor(q / (N + 1));
      const c = q % (N + 1);
      return c < N ? t('sl.side.left', { r: r + 1, c: c + 1 }) : t('sl.side.right', { r: r + 1, c });
    }
    const vertName = (v) => t('sl.vert', { r: Math.floor(v / (N + 1)) + 1, c: (v % (N + 1)) + 1 });
    /** Paramètres concrets du texte d'indice. */
    function explain(step, fresh, st) {
      const p = { side: sideOf(fresh[0][0]) };
      const cell = step.cells?.[0];
      if (cell != null) {
        p.r = Math.floor(cell / N) + 1;
        p.c = (cell % N) + 1;
        p.n = puz.clue[cell];
        let lines = 0;
        let free = 0;
        for (const k of g.cellEdges[cell]) { if (st.e[k] === 1) lines++; else if (st.e[k] === 0) free++; }
        p.lines = lines;
        p.free = free;
        p.missing = p.n - lines;
      }
      if (step.verts?.length === 1) p.v = vertName(step.verts[0]);
      if (step.tech === 'loop') { p.v1 = vertName(step.verts[0]); p.v2 = vertName(step.verts[1]); }
      if (step.tech === 'trial') {
        p.edge = sideOf(step.edges[0]);
        p.hyp = t(step.changes[0][1] === 1 ? 'sl.what.crossA' : 'sl.what.lineA');
        p.then = t(step.changes[0][1] === 1 ? 'sl.what.line' : 'sl.what.cross');
      }
      return p;
    }
    function showHint() {
      const hn = hint;
      if (hn.revealed) {
        message = {
          text: hn.edges.length === 1 ? t('sl.hint.revealOne', { side: sideOf(hn.edges[0][0]), what: t(hn.edges[0][1] === 1 ? 'sl.what.line' : 'sl.what.cross') }) : t('sl.hint.revealMany'),
          action: { label: t('sl.hint.place'), run: () => { for (const [k, v] of hn.edges) marks[k] = v; lastEdge = hn.edges[hn.edges.length - 1][0]; commit(); } },
        };
      } else {
        let text = t(`sl.hint.${hn.step.tech}`, hn.info);
        const names = [...new Set(hn.prior.filter((p) => p !== hn.step.tech).map((p) => t(`sl.prior.${p}`)))];
        if (names.length) text += ' ' + t('sl.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie ------------------------------------------------------------------
    const edgeAt = (e) => {
      const rect = svgNode.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * (N + 2 * PAD) - PAD;
      const y = ((e.clientY - rect.top) / rect.height) * (N + 2 * PAD) - PAD;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const hr = clamp(Math.round(y), 0, N);
      const hc = clamp(Math.floor(x), 0, N - 1);
      const dh = Math.hypot(Math.max(0, hc - x, x - (hc + 1)), y - hr);
      const vc = clamp(Math.round(x), 0, N);
      const vr = clamp(Math.floor(y), 0, N - 1);
      const dv = Math.hypot(x - vc, Math.max(0, vr - y, y - (vr + 1)));
      const best = dh <= dv ? [g.hEdge(hr, hc), dh] : [g.vEdge(vr, vc), dv];
      return best[1] <= 0.42 ? best[0] : -1;
    };
    let drag = null;
    board.addEventListener('pointerdown', (e) => {
      if (finished || e.button > 0) return;
      const k = edgeAt(e);
      if (k < 0) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      const from = marks[k];
      const to = (from + 1) % 3;
      drag = { from, to, last: k, changed: false, moved: false };
      marks[k] = to;
      lastEdge = k;
      drag.changed = true;
      render();
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = edgeAt(e);
      if (k < 0 || k === drag.last) return;
      drag.last = k;
      drag.moved = true;
      // on prolonge le geste : trait ou croix posés sur les côtés vides, effacement des côtés de même type
      if (drag.to !== 0 && marks[k] === 0) { marks[k] = drag.to; drag.changed = true; lastEdge = k; }
      else if (drag.to === 0 && marks[k] === drag.from) { marks[k] = 0; drag.changed = true; }
      render();
    });
    const endDrag = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.changed) commit();
    };
    board.addEventListener('pointerup', endDrag);
    board.addEventListener('pointercancel', endDrag);

    // --- rendu -------------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const showWrong = (k) => (mode === 'live' && isWrong(k)) || wrong.has(k);
      const hintCells = new Set();
      const hintVerts = new Set();
      const ghostSet = new Set();
      if (hint) {
        if (!hint.revealed) {
          for (const c of hint.step.cells ?? []) hintCells.add(c);
          for (const v of hint.step.verts ?? []) hintVerts.add(v);
          for (const k of hint.step.edges ?? []) ghostSet.add(k);
        } else for (const [k] of hint.edges) ghostSet.add(k);
      }
      const deg = new Int8Array(g.V);
      const lineCount = new Int8Array(NN);
      for (let k = 0; k < E; k++) {
        if (marks[k] !== 1) continue;
        deg[g.edgeV[k * 2]]++;
        deg[g.edgeV[k * 2 + 1]]++;
        for (const c of g.edgeCells[k]) lineCount[c]++;
      }
      for (let k = 0; k < E; k++) {
        const bad = showWrong(k);
        edgeEls[k].setAttribute('class', 'sl-edge' + (marks[k] === 1 ? ' on' : '') + (marks[k] === 1 && bad ? ' bad' : '') + (finished ? ' done' : ''));
        crossEls[k].setAttribute('class', 'sl-x' + (marks[k] === 2 ? ' on' : '') + (marks[k] === 2 && bad ? ' bad' : ''));
        ghostEls[k].setAttribute('class', 'sl-ghost' + (ghostSet.has(k) ? ' on' : ''));
      }
      // intérieur de la boucle, une fois terminée
      for (let i = 0; i < NN; i++) {
        let inside = false;
        if (finished) {
          const r = Math.floor(i / N);
          const c = i % N;
          let n = 0;
          for (let cc = 0; cc <= c; cc++) if (marks[g.vEdge(r, cc)] === 1) n++;
          inside = n % 2 === 1;
        }
        fillEls[i].setAttribute('class', 'sl-fill' + (inside ? ' inside' : '') + (hintCells.has(i) ? ' hint' : ''));
        const el = clueEls.get(i);
        if (el) {
          const cl = puz.clue[i];
          el.setAttribute('class', 'sl-clue' + (lineCount[i] === cl ? ' met' : mode === 'live' && lineCount[i] > cl ? ' over' : ''));
        }
      }
      for (let v = 0; v < g.V; v++) {
        dotEls[v].setAttribute('class', 'sl-dot' + (mode === 'live' && deg[v] > 2 ? ' bad' : ''));
        haloEls[v].setAttribute('class', 'sl-halo' + (hintVerts.has(v) ? ' on' : ''));
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

    // --- clavier -----------------------------------------------------------------
    function onKey(e) {
      if (document.querySelector('.sheet-backdrop') || e.metaKey || e.altKey) return;
      const k = e.key;
      if (e.ctrlKey && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.ctrlKey && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
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
