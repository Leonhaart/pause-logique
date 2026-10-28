// Outils communs aux jeux : historique annuler/refaire, bouton d'outil.
import { h } from '../core/dom.js';
import { iconEl } from './components.js';

/** Historique d'instantanés (chaînes). commit() ajoute un état, undo()/redo() renvoient l'état à afficher. */
export class History {
  constructor(initial, { limit = 1000, undo = [], redo = [] } = {}) {
    this.cur = initial;
    this.limit = limit;
    this.u = undo.slice();
    this.r = redo.slice();
  }
  commit(next) {
    if (next === this.cur) return false;
    this.u.push(this.cur);
    if (this.u.length > this.limit) this.u.shift();
    this.cur = next;
    this.r.length = 0;
    return true;
  }
  undo() {
    if (!this.u.length) return null;
    this.r.push(this.cur);
    this.cur = this.u.pop();
    return this.cur;
  }
  redo() {
    if (!this.r.length) return null;
    this.u.push(this.cur);
    this.cur = this.r.pop();
    return this.cur;
  }
  get canUndo() {
    return this.u.length > 0;
  }
  get canRedo() {
    return this.r.length > 0;
  }
  /** État sérialisable (on garde les 60 dernières actions pour limiter la taille). */
  dump(keep = 60) {
    return { snap: this.cur, undo: this.u.slice(-keep), redo: this.r.slice(-keep) };
  }
}

/** Bouton d'outil : icône + libellé court. */
export function toolButton({ icon, label, title, onClick, toggle = false }) {
  const el = h('button', { class: 'tool', 'aria-label': title || label, title: title || label, onClick },
    iconEl(icon), h('span', { class: 'tool-label' }, label));
  if (toggle) el.setAttribute('aria-pressed', 'false');
  return el;
}
