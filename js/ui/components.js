import { h, svgEl } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { uiIcon } from './icons.js';

export const iconEl = (name, cls = 'ui-icon') => svgEl(uiIcon(name), cls);

export function iconButton(name, label, onClick, cls = '') {
  return h('button', { class: `icon-btn ${cls}`.trim(), 'aria-label': label, title: label, onClick }, iconEl(name));
}

/** Contrôle segmenté (radiogroup). options : [{value, label}] */
export function segmented(label, options, value, onChange) {
  const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  for (const o of options) {
    group.append(
      h(
        'button',
        {
          class: 'seg-btn',
          role: 'radio',
          'aria-checked': String(o.value === value),
          onClick: () => onChange(o.value),
        },
        o.label,
      ),
    );
  }
  return group;
}

/** Ligne avec interrupteur. */
export function switchRow(label, hint, checked, onChange) {
  const sw = h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(checked),
    'aria-label': label,
    onClick: () => onChange(!checked),
  });
  return h(
    'div',
    { class: 'row' },
    h('div', { class: 'row-text' }, h('span', { class: 'row-label' }, label), hint ? h('span', { class: 'row-hint' }, hint) : null),
    sw,
  );
}

/** Feuille modale (bas d'écran sur mobile, centrée sur ordinateur). */
export function openSheet({ title, build, onClose, dismissible = true }) {
  const prevFocus = document.activeElement;
  const body = h('div', { class: 'sheet-body' });
  const api = { body, close, setTitle: (s) => (titleEl.textContent = s) };
  const titleEl = h('h2', { class: 'sheet-title', id: 'sheet-title' }, title);
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    h('div', { class: 'sheet-head' }, titleEl, dismissible ? iconButton('close', t('common.close'), () => close()) : null),
    body,
  );
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: (e) => e.target === backdrop && dismissible && close() }, sheet);

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) return close();
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  }
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    prevFocus?.focus?.();
    onClose?.();
  }
  document.addEventListener('keydown', onKey);
  build(body, api);
  document.body.append(backdrop);
  (sheet.querySelector('.seg-btn[aria-checked="true"], .btn, .icon-btn') ?? sheet).focus?.();
  return api;
}
