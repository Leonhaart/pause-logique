import { h, svgEl } from '../core/dom.js';
import { gameIcon } from '../ui/icons.js';

// Écran provisoire des jeux non livrés : sert aussi à tester le socle (minuteur, victoire, sauvegarde).
export default {
  mount(container, ctx) {
    ctx.save({ placeholder: true });
    const root = h(
      'div',
      { class: 'placeholder' },
      svgEl(gameIcon(ctx.gameId), 'placeholder-icon'),
      h('h2', { class: 'placeholder-title' }, ctx.t('shell.soon')),
      h('p', { class: 'placeholder-body' }, ctx.t('shell.soonBody')),
      h('button', { class: 'btn', onClick: () => ctx.complete() }, ctx.t('shell.fakeWin')),
    );
    container.append(root);
    return { destroy: () => root.remove() };
  },
};
