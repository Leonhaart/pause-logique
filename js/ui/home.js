import { h, svgEl } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { newSeed } from '../core/rng.js';
import { latestSave } from '../core/saves.js';
import { hashes } from '../core/router.js';
import { GAMES, getGame, randomLevel } from '../games/registry.js';
import { gameIcon } from './icons.js';
import { iconButton, iconEl } from './components.js';
import { openSettings, openStats } from './sheets.js';
import { pending, fly } from './transition.js';

export function mountHome(root, nav) {
  const tiles = GAMES.map((g) => {
    const icon = h('span', { class: 'tile-icon' }, svgEl(gameIcon(g.id)));
    return h(
      'button',
      {
        class: 'tile' + (g.ready ? '' : ' soon'),
        dataset: { game: g.id },
        onClick: () => {
          pending.zoomIn = { rect: icon.getBoundingClientRect(), markup: gameIcon(g.id) };
          nav.go(hashes.levels(g.id));
        },
      },
      icon,
      h('span', { class: 'tile-name' }, t(`game.${g.id}.name`)),
      g.ready ? null : h('span', { class: 'sr-only' }, t('home.soon')),
    );
  });

  const ready = GAMES.filter((g) => g.ready);
  const surprise = () => {
    const pool = ready.length ? ready : GAMES;
    const g = pool[Math.floor(Math.random() * pool.length)];
    const level = randomLevel(g.id);
    nav.go(hashes.play(g.id, level, newSeed()));
  };

  const last = latestSave(GAMES.map((g) => g.id));
  const actions = h('div', { class: 'home-actions' });
  if (last) {
    actions.append(
      h('button', { class: 'btn btn-primary', onClick: () => nav.go(hashes.play(last.gameId, last.data.level, last.data.seed)) },
        iconEl('play'), t('home.resume', { game: t(`game.${last.gameId}.name`) })),
    );
  }
  actions.append(h('button', { class: 'btn', onClick: surprise }, iconEl('shuffle'), t('home.surprise')));

  const screen = h(
    'section',
    { class: 'screen home' },
    h('header', { class: 'topbar' },
      h('h1', { class: 'brand' }, t('app.name')),
      h('div', { class: 'topbar-actions' },
        iconButton('stats', t('nav.stats'), () => openStats()),
        iconButton('settings', t('nav.settings'), () => openSettings()))),
    h('div', { class: 'board', role: 'group', 'aria-label': t('app.name') }, tiles),
    actions,
  );
  root.replaceChildren(screen);

  if (pending.back) {
    const { markup, rect, gameId } = pending.back;
    pending.back = null;
    const target = screen.querySelector(`[data-game="${gameId}"] .tile-icon`);
    if (target) fly(markup, rect, target.getBoundingClientRect(), target.firstElementChild);
  }
  return { destroy() {} };
}
