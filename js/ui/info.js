// Description d'un jeu : onglets Règles / Techniques, et encadré repliable.
import { h } from '../core/dom.js';
import { t, lang } from '../core/i18n.js';
import { iconEl } from './components.js';

/** Onglets Règles / Techniques pour un jeu. */
export function infoTabs(gameId) {
  const tabs = [
    { id: 'rules', label: t('info.tab.rules') },
    { id: 'tech', label: t('info.tab.tech') },
  ];
  let current = 'rules';
  const bar = h('div', { class: 'seg info-tabs', role: 'tablist', 'aria-label': t('info.title') });
  const panel = h('div', { class: 'info-panel', role: 'tabpanel', lang: lang() });
  const content = () => {
    if (current === 'rules') return h('p', { class: 'rules-text' }, t(`game.${gameId}.rules`));
    return h('ul', { class: 'tech-list' }, t(`game.${gameId}.tech`).split('\n').map((s) => h('li', {}, s)));
  };
  const render = () => {
    bar.replaceChildren(...tabs.map((x) =>
      h('button', {
        class: 'seg-btn', role: 'tab', id: `info-tab-${x.id}`, 'aria-selected': String(x.id === current),
        'aria-checked': String(x.id === current), tabindex: x.id === current ? '0' : '-1',
        onClick: () => { current = x.id; render(); },
        onKeydown: (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          current = tabs[(tabs.findIndex((y) => y.id === current) + 1) % tabs.length].id;
          render();
          bar.querySelector('[aria-selected="true"]').focus();
        },
      }, x.label)));
    panel.setAttribute('aria-labelledby', `info-tab-${current}`);
    panel.replaceChildren(content());
  };
  render();
  return h('div', { class: 'info-tabs-wrap' }, bar, panel);
}

/** Encadré « Description » replié par défaut, avec une flèche. */
export function infoPanel(gameId) {
  const body = h('div', { class: 'info-body', id: `info-body-${gameId}`, hidden: true }, infoTabs(gameId));
  const btn = h('button', {
    class: 'info-toggle', 'aria-expanded': 'false', 'aria-controls': body.id,
    onClick: () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    },
  }, h('span', {}, t('info.title')), iconEl('chevron', 'ui-icon info-chevron'));
  return h('div', { class: 'info' }, btn, body);
}
