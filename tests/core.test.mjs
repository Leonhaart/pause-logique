import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, newSeed, hashSeed } from '../js/core/rng.js';
import { Timer } from '../js/core/timer.js';
import { formatTime } from '../js/core/format.js';
import { parseHash, hashes } from '../js/core/router.js';
import { recordWin, levelStats, currentStreak, dayKey, resetStats, loadStats } from '../js/core/stats.js';
import { saveGame, loadSave, clearSave, latestSave } from '../js/core/saves.js';
import { storage } from '../js/core/storage.js';
import { resolveLang, setLanguage, t } from '../js/core/i18n.js';
import fr from '../js/i18n/fr.js';
import en from '../js/i18n/en.js';
import { GAMES, LEVELS } from '../js/games/registry.js';
import { GAME_ICONS } from '../js/ui/icons.js';
import { buildAssets } from '../tools/gen-sw-assets.mjs';
import { readFileSync } from 'node:fs';

test('rng : même graine, même suite ; graines différentes, suites différentes', () => {
  const a = createRng('abc'), b = createRng('abc'), c = createRng('abd');
  const sa = Array.from({ length: 20 }, () => a.next());
  assert.deepEqual(sa, Array.from({ length: 20 }, () => b.next()));
  assert.notDeepEqual(sa, Array.from({ length: 20 }, () => c.next()));
  assert.ok(sa.every((x) => x >= 0 && x < 1));
  assert.equal(hashSeed('x'), hashSeed('x'));
});

test('rng : shuffle conserve les éléments et est reproductible', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const s1 = createRng(7).shuffle(arr), s2 = createRng(7).shuffle(arr);
  assert.deepEqual(s1, s2);
  assert.deepEqual([...s1].sort(), arr.map(String).sort().map(Number).sort((x, y) => x - y));
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('newSeed : 6 caractères base36', () => {
  for (let i = 0; i < 50; i++) assert.match(newSeed(), /^[0-9a-z]{6}$/);
});

test('timer : pause et reprise avec horloge injectée', () => {
  let now = 0;
  const tm = new Timer(() => now);
  tm.start(); now = 1000; assert.equal(tm.elapsed(), 1000);
  tm.pause(); now = 5000; assert.equal(tm.elapsed(), 1000);
  tm.start(); now = 6500; assert.equal(tm.elapsed(), 2500);
  tm.set(10000); assert.equal(tm.elapsed(), 10000);
  now = 7000; assert.equal(tm.elapsed(), 10500);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(83000), '01:23');
  assert.equal(formatTime(3725000), '1:02:05');
  assert.equal(formatTime(-5), '00:00');
});

test('router : aller-retour', () => {
  assert.deepEqual(parseHash(''), { name: 'home' });
  assert.deepEqual(parseHash('#/'), { name: 'home' });
  assert.deepEqual(parseHash(hashes.levels('sudoku')), { name: 'levels', gameId: 'sudoku' });
  assert.deepEqual(parseHash(hashes.play('starbattle', 'hard', 'ab12cd')), { name: 'play', gameId: 'starbattle', level: 'hard', seed: 'ab12cd' });
  assert.deepEqual(parseHash('#/p/sudoku/easy'), { name: 'home' });
});

test('stats : records, moyenne, minuteur désactivé', () => {
  storage.clear();
  assert.equal(recordWin('sudoku', 'easy', 60000, '2026-10-01').record, false); // premier temps
  assert.equal(recordWin('sudoku', 'easy', 50000, '2026-10-01').record, true);
  assert.equal(recordWin('sudoku', 'easy', 70000, '2026-10-02').record, false);
  recordWin('sudoku', 'easy', null, '2026-10-02');
  const s = levelStats('sudoku', 'easy');
  assert.equal(s.done, 4); assert.equal(s.timed, 3); assert.equal(s.best, 50000); assert.equal(s.sum, 180000);
  assert.deepEqual(loadStats().days, ['2026-10-01', '2026-10-02']);
  resetStats();
  assert.equal(levelStats('sudoku', 'easy').done, 0);
});

test('stats : série de jours', () => {
  const days = ['2026-10-25', '2026-10-26', '2026-10-27'];
  assert.equal(currentStreak(days, '2026-10-27'), 3);
  assert.equal(currentStreak(days, '2026-10-28'), 3); // joué hier : série encore vivante
  assert.equal(currentStreak(days, '2026-10-29'), 0);
  assert.equal(currentStreak([], '2026-10-28'), 0);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('sauvegardes : écriture, lecture, plus récente, effacement', () => {
  storage.clear();
  saveGame('sudoku', { level: 'easy', seed: 'a', at: 1 });
  saveGame('akari', { level: 'hard', seed: 'b', at: 5 });
  assert.equal(loadSave('sudoku').seed, 'a');
  assert.equal(latestSave(['sudoku', 'akari', 'tents']).gameId, 'akari');
  clearSave('akari');
  assert.equal(latestSave(['sudoku', 'akari']).gameId, 'sudoku');
  assert.equal(loadSave('tents'), null);
});

test('i18n : mêmes clés en FR et EN, mêmes paramètres', () => {
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const k of Object.keys(fr)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(fr[k]), ph(en[k]), `paramètres différents pour ${k}`);
    assert.ok(fr[k].trim() && en[k].trim(), `texte vide pour ${k}`);
  }
});

test('i18n : résolution de langue et paramètres', () => {
  assert.equal(resolveLang('auto', 'fr-CH'), 'fr');
  assert.equal(resolveLang('auto', 'en-GB'), 'en');
  assert.equal(resolveLang('en', 'fr'), 'en');
  setLanguage('en');
  assert.equal(t('home.resume', { game: 'Sudoku' }), 'Resume Sudoku');
  assert.equal(t('cle.inconnue'), 'cle.inconnue');
  setLanguage('fr');
});

test('registre : 9 jeux, icône et textes pour chacun, niveaux', () => {
  assert.equal(GAMES.length, 9);
  assert.equal(new Set(GAMES.map((g) => g.id)).size, 9);
  assert.deepEqual(LEVELS, ['easy', 'medium', 'hard']);
  for (const g of GAMES) {
    assert.ok(GAME_ICONS[g.id], `icône manquante : ${g.id}`);
    for (const k of ['name', 'desc', 'rules']) assert.ok(fr[`game.${g.id}.${k}`] && en[`game.${g.id}.${k}`], `${g.id}.${k}`);
  }
});

test('service worker : sw-assets.js à jour (relancer node tools/gen-sw-assets.mjs sinon)', () => {
  const { source, assets } = buildAssets();
  assert.equal(readFileSync(new URL('../sw-assets.js', import.meta.url), 'utf8'), source);
  for (const must of ['./', 'index.html', 'js/main.js', 'css/style.css', 'manifest.webmanifest']) assert.ok(assets.includes(must), must);
});
