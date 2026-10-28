import { h } from '../core/dom.js';
import { t, lang } from '../core/i18n.js';
import { formatTime } from '../core/format.js';
import { getSettings, setSetting, subscribe } from '../core/settings.js';
import { loadStats, currentStreak, resetStats } from '../core/stats.js';
import { GAMES, LEVELS } from '../games/registry.js';
import { openSheet, segmented, switchRow } from './components.js';

export function openSettings() {
  let unsub;
  return openSheet({
    title: t('settings.title'),
    onClose: () => unsub?.(),
    build(body, api) {
      const render = () => {
        const s = getSettings();
        api.setTitle(t('settings.title'));
        let confirming = body.dataset.confirming === '1';
        body.replaceChildren(
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('settings.language')),
            segmented(t('settings.language'), [
              { value: 'auto', label: t('settings.lang.auto') },
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ], s.lang, (v) => setSetting('lang', v))),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('settings.theme')),
            segmented(t('settings.theme'), [
              { value: 'auto', label: t('settings.theme.auto') },
              { value: 'dark', label: t('settings.theme.dark') },
              { value: 'light', label: t('settings.theme.light') },
            ], s.theme, (v) => setSetting('theme', v))),
          switchRow(t('settings.timer'), t('settings.timerHint'), s.timer, (v) => setSetting('timer', v)),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('settings.errors')),
            segmented(t('settings.errors'), [
              { value: 'never', label: t('settings.errors.never') },
              { value: 'ask', label: t('settings.errors.ask') },
              { value: 'live', label: t('settings.errors.live') },
            ], s.errors, (v) => setSetting('errors', v)),
            h('span', { class: 'row-hint' }, t('settings.errorsHint'))),
          switchRow(t('settings.hints'), null, s.hints, (v) => setSetting('hints', v)),
          confirming
            ? h('div', { class: 'confirm' }, h('span', {}, t('settings.resetConfirm')),
                h('div', { class: 'confirm-actions' },
                  h('button', { class: 'btn btn-danger', onClick: () => { resetStats(); body.dataset.confirming = ''; render(); } }, t('settings.resetYes')),
                  h('button', { class: 'btn btn-quiet', onClick: () => { body.dataset.confirming = ''; render(); } }, t('common.cancel'))))
            : h('button', { class: 'btn btn-quiet', onClick: () => { body.dataset.confirming = '1'; render(); } }, t('settings.reset')),
        );
      };
      render();
      unsub = subscribe(render);
    },
  });
}

export function openStats() {
  return openSheet({
    title: t('stats.title'),
    build(body) {
      const stats = loadStats();
      const streak = currentStreak(stats.days);
      const played = GAMES.filter((g) => stats.games[g.id]);
      if (!played.length) {
        body.append(h('p', { class: 'empty' }, t('stats.empty')));
        return;
      }
      body.append(h('div', { class: 'streak' }, h('span', { class: 'streak-n' }, t('stats.days', { n: streak })), h('span', { class: 'row-hint' }, t('stats.streak'))));
      for (const g of played) {
        const rows = LEVELS.filter((l) => stats.games[g.id][l]).map((l) => {
          const s = stats.games[g.id][l];
          const bits = [t('stats.done', { n: s.done })];
          if (s.timed) bits.push(t('stats.avg', { time: formatTime(s.sum / s.timed) }), t('stats.best', { time: formatTime(s.best) }));
          return h('li', {}, h('span', { class: 'stat-level' }, t(`level.${l}`)), h('span', { class: 'stat-bits' }, bits.join(', ')));
        });
        body.append(h('section', { class: 'stat-block' }, h('h3', {}, t(`game.${g.id}.name`)), h('ul', { class: 'stat-list' }, rows)));
      }
    },
  });
}

export function openRules(gameId) {
  return openSheet({
    title: t(`game.${gameId}.name`),
    build(body) {
      body.append(h('p', { class: 'rules-text', lang: lang() }, t(`game.${gameId}.rules`)));
    },
  });
}
