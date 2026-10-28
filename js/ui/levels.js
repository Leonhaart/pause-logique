import { h, svgEl } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { formatTime } from '../core/format.js';
import { newSeed } from '../core/rng.js';
import { loadSave } from '../core/saves.js';
import { levelStats } from '../core/stats.js';
import { getSettings, setSetting } from '../core/settings.js';
import { hashes } from '../core/router.js';
import { LEVELS, sizesOf, makeLevel, levelLabel, randomLevel } from '../games/registry.js';
import { storage } from '../core/storage.js';
import { gameIcon } from './icons.js';
import { iconButton, iconEl, switchRow, segmented } from './components.js';
import { openSettings, openRules } from './sheets.js';
import { pending, fly } from './transition.js';

export function mountLevels(root, gameId, nav) {
  const hero = h('div', { class: 'hero-icon' }, svgEl(gameIcon(gameId)));

  const sizes = sizesOf(gameId);
  let size = sizes ? (sizes.includes(storage.get('size:' + gameId)) ? storage.get('size:' + gameId) : sizes[Math.floor(sizes.length / 2)]) : null;
  const levelFor = (diff) => makeLevel(diff, size);

  const start = (level) => {
    const lv = level === 'random' ? randomLevel(gameId, size) : levelFor(level);
    nav.go(hashes.play(gameId, lv, newSeed()));
  };

  const pips = (n) =>
    h('span', { class: 'pips', 'aria-hidden': 'true' }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })));

  const levelBtn = (level, i) => {
    const best = level === 'random' ? null : levelStats(gameId, levelFor(level)).best;
    return h('button', { class: 'level-btn', onClick: () => start(level) },
      level === 'random' ? iconEl('shuffle', 'ui-icon level-shuffle') : pips(i + 1),
      h('span', { class: 'level-name' }, t(`level.${level}`)),
      h('span', { class: 'level-best' }, level === 'random' ? '' : best != null ? t('levels.best', { time: formatTime(best) }) : ''));
  };

  const save = loadSave(gameId);
  const resume = save
    ? h('button', { class: 'btn btn-primary resume', onClick: () => nav.go(hashes.play(gameId, save.level, save.seed)) },
        iconEl('play'),
        h('span', {}, t('levels.resume')),
        h('span', { class: 'resume-info' }, t('levels.resumeInfo', { level: levelLabel(save.level), time: formatTime(save.elapsed ?? 0) })))
    : null;

  const sizeRow = h('div', { class: 'size-row' });
  const renderLevels = () => levelList.replaceChildren(...[...LEVELS, 'random'].map(levelBtn));
  const renderSizes = () => {
    if (!sizes) return;
    sizeRow.replaceChildren(
      h('span', { class: 'size-label' }, t('levels.size')),
      segmented(t('levels.size'), sizes.map((n) => ({ value: n, label: `${n}×${n}` })), size, (v) => {
        size = v;
        storage.set('size:' + gameId, v);
        renderSizes();
        renderLevels();
      }),
    );
  };
  const timerRow = h('div', { class: 'timer-row' });
  const renderTimerRow = () =>
    timerRow.replaceChildren(switchRow(t('levels.timer'), null, getSettings().timer, (v) => { setSetting('timer', v); renderTimerRow(); }));
  renderTimerRow();

  const back = iconButton('back', t('nav.back'), () => {
    pending.back = { gameId, markup: gameIcon(gameId), rect: hero.firstElementChild.getBoundingClientRect() };
    nav.go(hashes.home());
  });

  const levelList = h('div', { class: 'level-list' });
  renderLevels();
  renderSizes();
  const screen = h('section', { class: 'screen levels' },
    h('header', { class: 'topbar' }, back, h('div', { class: 'topbar-actions' },
      iconButton('rules', t('levels.rules'), () => openRules(gameId)),
      iconButton('settings', t('nav.settings'), () => openSettings()))),
    h('div', { class: 'hero' }, hero,
      h('h1', { class: 'hero-title' }, t(`game.${gameId}.name`)),
      h('p', { class: 'hero-desc' }, t(`game.${gameId}.desc`))),
    h('div', { class: 'levels-body' }, resume, sizes ? sizeRow : null, levelList, timerRow));
  root.replaceChildren(screen);

  if (pending.zoomIn) {
    const { markup, rect } = pending.zoomIn;
    pending.zoomIn = null;
    screen.classList.add('enter');
    fly(markup, rect, hero.firstElementChild.getBoundingClientRect(), hero.firstElementChild);
  }
  return { destroy() {} };
}
