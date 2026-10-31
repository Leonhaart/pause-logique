// Hashi : interface. On touche une île puis une île voisine : 1 pont, 2 ponts, 0. Toucher un pont fait pareil.
import { h, svgEl } from '../../core/dom.js';
import { History, toolButton } from '../../ui/kit.js';
import { geoOf, newState, allSteps, isSolution } from './solver.js';
import { planHint, manhattan } from '../../core/hint.js';
import { puzzleFor } from './puzzle.js';
import { consume, refillAll, stockInfo, onStock } from './pool.js';

// Pictogramme d'île : montagne, ligne de terre et deux vagues (centré sur la case)
const LAND = 'M-0.46 0.3L-0.27-0.08L-0.18 0L-0.02-0.46L0.08-0.26L0.16-0.34L0.46 0.3Z';

export default {
  mount(container, ctx) {
    const { t } = ctx;
    const [diff, sizeStr] = ctx.level.split('-');
    const N = +sizeStr || 9;
    let saved = ctx.restore;
    const { pid, puz, sol } = puzzleFor(N, diff, ctx.seed, ctx.rng, saved?.pid);
    const g = geoOf(puz);
    const E = g.edges.length;
    // sauvegarde d'une ancienne banque : on l'ignore si elle ne correspond pas à cette grille
    if (saved && (typeof saved.snap !== 'string' || saved.snap.length !== E || [...saved.snap].some((ch, x) => +ch > g.edges[x].max))) saved = null;
    const row = (i) => Math.floor(i / N);
    const col = (i) => i % N;

    // marks : nombre de ponts par arête
    const marks = new Uint8Array(E);
    const snapshot = () => Array.from(marks).join('');
    const load = (snap) => { for (let x = 0; x < E; x++) marks[x] = +snap[x]; };
    const hist = new History(saved?.snap ?? snapshot(), saved ? { undo: saved.undo, redo: saved.redo } : {});
    if (saved) load(hist.cur);

    // arêtes par paire d'îles et par case intermédiaire
    const pairEdge = new Map(g.edges.map((e, x) => [`${e.a}-${e.b}`, x]));
    const edgeBetween = (a, b) => pairEdge.get(`${a}-${b}`) ?? pairEdge.get(`${b}-${a}`);
    const cellEdges = new Map();
    g.edges.forEach((e, x) => { for (const c of e.cells) { if (!cellEdges.has(c)) cellEdges.set(c, []); cellEdges.get(c).push(x); } });

    let sel = -1; // île sélectionnée
    let wrong = new Set();
    let hint = null;
    let message = null;
    let finished = false;

    const board = h('div', { class: 'ha-board', role: 'img', 'aria-label': t('game.hashi.name') });
    const msgEl = h('div', { class: 'game-msg', 'aria-live': 'polite' });
    const tools = {
      undo: toolButton({ icon: 'undo', label: t('tool.undo'), onClick: () => undo() }),
      redo: toolButton({ icon: 'redo', label: t('tool.redo'), onClick: () => redo() }),
      hint: toolButton({ icon: 'bulb', label: t('tool.hint'), onClick: () => askHint() }),
      check: toolButton({ icon: 'check', label: t('tool.check'), onClick: () => check() }),
    };
    const root = h('div', { class: 'ha' }, h('div', { class: 'ha-board-wrap' }, board), msgEl, h('div', { class: 'tools' }, Object.values(tools)));
    container.append(root);

    const degree = (i) => g.inc[i].reduce((s, x) => s + marks[x], 0);
    const blocked = (x) => g.cross[x].some((y) => marks[y] > 0);

    // --- historique ----------------------------------------------------------
    const persist = () => ctx.save({ ...hist.dump(), pid });
    function reset() { wrong = new Set(); hint = null; message = null; }
    let lastX = -1; // dernière liaison modifiée par le joueur
    function commit() {
      reset();
      const before = hist.cur;
      const now = snapshot();
      for (let x = 0; x < E; x++) if (before[x] !== now[x]) { lastX = x; break; }
      if (hist.commit(snapshot())) persist();
      render();
      checkComplete();
    }
    function undo() { const s = hist.undo(); if (s == null) return; load(s); reset(); persist(); render(); }
    function redo() { const s = hist.redo(); if (s == null) return; load(s); reset(); persist(); render(); }

    // --- vérification et fin -------------------------------------------------
    function check() {
      if (finished) return;
      wrong = new Set();
      for (let x = 0; x < E; x++) if (marks[x] > sol[x]) wrong.add(x);
      message = { text: wrong.size === 0 ? t('ha.noErrors') : wrong.size === 1 ? t('ha.errorFound') : t('ha.errorsFound', { n: wrong.size }) };
      render();
    }
    function checkComplete() {
      if (finished) return;
      if (!g.islands.every((isl, i) => degree(i) === isl.v)) return;
      if (!isSolution(puz, marks)) { message = { text: t('ha.split') }; return render(); }
      finished = true;
      sel = -1;
      render();
      consume(N, diff, pid);
      ctx.complete({ stock: { get: () => stockInfo(N, diff), subscribe: onStock } });
    }

    // --- indices -------------------------------------------------------------
    function askHint() {
      if (finished) return;
      if (!ctx.settings().hints) { message = { text: t('ha.hintsOff') }; return render(); }
      if (hint && !hint.revealed) { hint.revealed = true; return showHint(); }
      // On ne retient que les arêtes justes déjà posées par le joueur.
      const st = newState(puz);
      for (let x = 0; x < E; x++) if (marks[x] === sol[x]) st.dom[x] = 1 << sol[x];
      const mid = (x) => { const a = g.islands[g.edges[x].a]; const b = g.islands[g.edges[x].b]; return [(a.r + b.r) / 2, (a.c + b.c) / 2]; };
      const last = lastX >= 0 ? mid(lastX) : null;
      const lowOf = (m) => (m & 1 ? 0 : m & 2 ? 1 : 2);
      // toutes les déductions disponibles : la plus facile, et à égalité la plus proche de la dernière liaison touchée
      const plan = planHint({
        // d'abord les liaisons déjà fixées par l'ensemble des contraintes mais pas encore posées
        collect: () => {
          const pend = [];
          for (let x = 0; x < E; x++) {
            const m = st.dom[x];
            if ((m & (m - 1)) === 0 && lowOf(m) >= 1 && marks[x] < lowOf(m)) pend.push(x);
          }
          if (pend.length) return pend.map((x) => ({ tech: 'determined', level: 0, changes: [[x, st.dom[x]]], focus: [g.edges[x].a, g.edges[x].b], edges: [x] }));
          return allSteps(st, 4);
        },
        apply: (s) => { for (const [x, m] of s.changes) st.dom[x] &= m; },
        fresh: (s) => s.changes.filter(([x, m]) => lowOf(m) >= 1 && marks[x] < lowOf(m)).map(([x, m]) => [x, lowOf(m)]),
        where: (s, f) => f.map(([x]) => mid(x)),
        last,
      });
      let found = null;
      if (plan) found = { step: plan.step, cells: plan.fresh, prior: plan.prior, info: explain(plan.step, plan.fresh, st) };
      else {
        let x = -1;
        let bd = Infinity;
        for (let k = 0; k < E; k++) {
          if (marks[k] >= sol[k]) continue;
          const dd = last ? manhattan(mid(k), last) : 0;
          if (dd < bd) { bd = dd; x = k; }
        }
        if (x < 0) return;
        found = { step: { tech: 'search', focus: [g.edges[x].a, g.edges[x].b], edges: [x] }, cells: [[x, marks[x] + 1]], prior: [], info: islandsOf(x) };
      }
      hint = { ...found, revealed: false };
      showHint();
    }
    /** Îles aux deux bouts d'une liaison, pour les textes. */
    function islandsOf(x) {
      const a = g.islands[g.edges[x].a];
      const b = g.islands[g.edges[x].b];
      return { r: a.r + 1, c: a.c + 1, v: a.v, r2: b.r + 1, c2: b.c + 1 };
    }
    /** Paramètres concrets du texte d'indice (île, voisine, nombre de ponts). */
    function explain(step, fresh, st) {
      const [x, n] = fresh[0];
      const p = { ...islandsOf(x), n };
      if (step.tech.startsWith('trial')) {
        const ch = step.changes.find(([y]) => y === x) ?? step.changes[0];
        const removed = st.dom[ch[0]] & ~ch[1];
        p.k = [0, 1, 2].filter((k) => removed & (1 << k)).join(', ');
      }
      // l'île de référence est celle de la déduction (focus), pas forcément le premier bout de la liaison
      const f = step.focus?.[0];
      if ((step.tech === 'must' || step.tech === 'cap') && f != null && f !== g.edges[x].a) {
        const a = g.islands[g.edges[x].b];
        const b = g.islands[g.edges[x].a];
        Object.assign(p, { r: a.r + 1, c: a.c + 1, v: a.v, r2: b.r + 1, c2: b.c + 1 });
      }
      if (step.tech.startsWith('trial') && step.why) {
        const w = step.why;
        const e = g.edges[w.hyp[0]];
        const A = g.islands[e.a];
        const B = g.islands[e.b];
        p.r = A.r + 1; p.c = A.c + 1; p.v = A.v; p.r2 = B.r + 1; p.c2 = B.c + 1;
        p.hyp = t(`ha.hyp.${w.hyp[1]}`);
        p.ng = w.ghost.filter(([, v]) => v >= 1).length;
        const f = w.fail;
        if (f) {
          const I = f.island != null ? g.islands[f.island] : f.islands ? g.islands[f.islands[0]] : null;
          p.fail = t(`ha.fail.${f.kind}`, { fv: I?.v ?? 0, fr: (I?.r ?? 0) + 1, fc: (I?.c ?? 0) + 1 });
        } else p.fail = '';
      }
      return p;
    }
    function showHint() {
      const hn = hint;
      if (hn.revealed) {
        const [x, n] = hn.cells[0];
        const a = g.islands[g.edges[x].a];
        const b = g.islands[g.edges[x].b];
        message = {
          text: hn.cells.length === 1 ? t('ha.hint.revealOne', { r1: a.r + 1, c1: a.c + 1, r2: b.r + 1, c2: b.c + 1, n }) : t('ha.hint.revealMany'),
          action: { label: t('ha.hint.place'), run: () => { for (const [y, v] of hn.cells) marks[y] = v; commit(); } },
        };
      } else {
        let text = t(hn.step.tech.startsWith('trial') ? (hn.info.ng ? 'ha.hint.trialChain' : 'ha.hint.trial') : `ha.hint.${hn.step.tech}`, hn.info);
        const names = [...new Set(hn.prior.filter((p) => p !== hn.step.tech).map((p) => t(`ha.prior.${p}`)))];
        if (names.length) text += ' ' + t('ha.hint.prior', { list: names.join(', ') });
        message = { text, action: { label: t('hint.reveal'), run: () => askHint() } };
      }
      render();
    }

    // --- saisie --------------------------------------------------------------
    function tapEdge(x) {
      if (blocked(x) && marks[x] === 0) { message = { text: t('ha.cross') }; return render(); }
      marks[x] = (marks[x] + 1) % (g.edges[x].max + 1);
      commit();
    }
    function tapIsland(i) {
      if (sel < 0) sel = i;
      else if (sel === i) sel = -1;
      else {
        const x = edgeBetween(sel, i);
        if (x == null) sel = i;
        else return tapEdge(x);
      }
      message = null;
      render();
    }
    board.addEventListener('pointerdown', (e) => {
      if (finished || e.button > 0) return;
      const rect = board.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
      if (r < 0 || r >= N || c < 0 || c >= N) return;
      e.preventDefault();
      const cell = r * N + c;
      const isl = g.id[cell];
      if (isl >= 0) return tapIsland(isl);
      const xs = cellEdges.get(cell);
      if (!xs) { sel = -1; return render(); }
      const pick = xs.find((x) => marks[x] > 0) ?? xs.find((x) => sel >= 0 && (g.edges[x].a === sel || g.edges[x].b === sel)) ?? xs[0];
      tapEdge(pick);
    });

    // --- rendu ---------------------------------------------------------------
    function render() {
      const mode = ctx.settings().errors;
      const hl = new Set(hint && !hint.revealed ? hint.step.edges ?? [] : []);
      const hf = new Set(hint && !hint.revealed ? hint.step.focus ?? [] : []);
      const hc = new Set(hint?.revealed ? hint.cells.map(([x]) => x) : []);
      const P = (i) => [col(i) + 0.5, row(i) + 0.5];
      const why = hint && !hint.revealed && hint.step.tech.startsWith('trial') ? hint.step.why : null;
      const failIsl = new Set(why?.fail?.island != null ? [why.fail.island] : why?.fail?.islands ?? []);
      const parts = [];
      for (let k = 0; k < N * N; k++) parts.push(`<circle class="ha-pt" cx="${col(k) + 0.5}" cy="${row(k) + 0.5}" r="0.045"/>`);
      g.edges.forEach((e, x) => {
        const [x1, y1] = P(g.islands[e.a].cell);
        const [x2, y2] = P(g.islands[e.b].cell);
        const cls = ['ha-bridge'];
        if (hl.has(x)) cls.push('hint-unit');
        if (hc.has(x)) cls.push('hint-cell');
        if ((mode === 'live' && marks[x] > sol[x]) || wrong.has(x)) cls.push('bad');
        if (hl.has(x) || hc.has(x)) parts.push(`<line class="ha-glow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
        const off = marks[x] === 2 ? [-0.1, 0.1] : marks[x] === 1 ? [0] : [];
        for (const o of off) {
          const dx = e.dir === 'h' ? 0 : o;
          const dy = e.dir === 'h' ? o : 0;
          parts.push(`<line class="${cls.join(' ')}" x1="${x1 + dx}" y1="${y1 + dy}" x2="${x2 + dx}" y2="${y2 + dy}"/>`);
        }
      });
      if (why) {
        const mid = (x) => { const [ax, ay] = P(g.islands[g.edges[x].a].cell); const [bx, by] = P(g.islands[g.edges[x].b].cell); return [(ax + bx) / 2, (ay + by) / 2]; };
        const dashed = (x, n, cls) => {
          const e = g.edges[x];
          const [x1, y1] = P(g.islands[e.a].cell);
          const [x2, y2] = P(g.islands[e.b].cell);
          const offs = n === 2 ? [-0.1, 0.1] : [0];
          for (const o of offs) {
            const dx = e.dir === 'h' ? 0 : o;
            const dy = e.dir === 'h' ? o : 0;
            parts.push(`<line class="${cls}" x1="${x1 + dx}" y1="${y1 + dy}" x2="${x2 + dx}" y2="${y2 + dy}"/>`);
          }
        };
        for (const [y, v] of why.ghost) if (v >= 1) dashed(y, v, 'ha-ghost');
        const [hx, hk] = why.hyp;
        if (hk === 0) { const [mx, my] = mid(hx); parts.push(`<text class="ha-hyp" x="${mx}" y="${my + 0.17}">✕</text>`); } else dashed(hx, hk, 'ha-ghost ha-hypline');
        if (why.fail?.edge != null) { const [mx, my] = mid(why.fail.edge); parts.push(`<circle class="ha-failmark" cx="${mx}" cy="${my}" r="0.24"/>`); }
      }
      const near = new Set();
      if (sel >= 0) for (const x of g.inc[sel]) if (!(blocked(x) && marks[x] === 0)) near.add(g.edges[x].a === sel ? g.edges[x].b : g.edges[x].a);
      g.islands.forEach((isl, i) => {
        const d = degree(i);
        const cls = ['ha-isl'];
        if (d === isl.v) cls.push('met');
        else if (d > isl.v && mode === 'live') cls.push('over');
        if (i === sel && !finished) cls.push('sel');
        else if (near.has(i) && !finished) cls.push('near');
        if (hf.has(i) && !why) cls.push('hint-focus');
        if (failIsl.has(i)) cls.push('hint-fail');
        const [cx, cy] = P(isl.cell);
        parts.push(`<g class="${cls.join(' ')}" role="img" aria-label="${t('ha.island', { n: isl.v, c: d })}" transform="translate(${cx} ${cy})"><path class="ha-land" d="${LAND}"/><text x="0" y="0.2">${isl.v}</text></g>`);
      });
      const svg = svgEl(`<svg viewBox="0 0 ${N} ${N}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`);
      board.replaceChildren(svg);
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

    function onKey(e) {
      if (document.querySelector('.sheet-backdrop') || e.metaKey || e.altKey) return;
      const k = e.key;
      if (e.ctrlKey && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (e.ctrlKey && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (k === 'Escape' && sel >= 0) { sel = -1; render(); }
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
