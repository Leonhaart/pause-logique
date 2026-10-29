// Icônes des 9 jeux (viewBox 64) et icônes d'interface (viewBox 24). Traits en currentColor,
// éléments d'accent en var(--accent).
const G = (inner) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const U = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

const star = (cx, cy, R = 4.8, r = 2.1) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="var(--accent)" stroke="var(--accent)" stroke-width="1"/>`;
};
const txt = (x, y, s, size = 12, fill = 'currentColor') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${fill}" stroke="none" font-family="ui-sans-serif, system-ui, sans-serif">${s}</text>`;

const nonoFill = ['2,0', '1,1', '2,1', '3,1', '0,2', '1,2', '2,2', '3,2', '4,2', '2,3', '2,4']
  .map((p) => {
    const [c, r] = p.split(',').map(Number);
    return `<rect x="${22 + c * 7.2}" y="${22 + r * 7.2}" width="7.2" height="7.2" fill="var(--accent)" stroke="none"/>`;
  })
  .join('');

export const GAME_ICONS = {
  sudoku: G(
    `<rect x="8" y="8" width="48" height="48"/><path d="M24 8v48M40 8v48M8 24h48M8 40h48" stroke-width="1.5"/>` +
      txt(16, 20.5, '5') + txt(48, 20.5, '3') + txt(32, 36.5, '9', 12, 'var(--accent)') + txt(16, 52.5, '7') + txt(48, 52.5, '1'),
  ),
  starbattle: G(
    `<rect x="8" y="8" width="48" height="48"/><path d="M20 8v48M32 8v48M44 8v48M8 20h48M8 32h48M8 44h48" stroke-width="1"/>` +
      `<path d="M32 8v24h24M8 32h12v24M20 44h24v12" stroke-width="3"/>` +
      star(26, 14) + star(50, 26) + star(14, 38) + star(38, 50),
  ),
  nonogram: G(
    nonoFill +
      `<rect x="22" y="22" width="36" height="36" stroke-width="2"/><path d="M29.2 22v36M36.4 22v36M43.6 22v36M50.8 22v36M22 29.2h36M22 36.4h36M22 43.6h36M22 50.8h36" stroke-width="1"/>` +
      txt(25.6, 19.5, '1', 6.5) + txt(32.8, 19.5, '2', 6.5) + txt(40, 19.5, '5', 6.5) + txt(47.2, 19.5, '2', 6.5) + txt(54.4, 19.5, '1', 6.5) +
      txt(18.5, 28, '1', 6.5) + txt(18.5, 35.2, '3', 6.5) + txt(18.5, 42.4, '5', 6.5) + txt(18.5, 49.6, '1', 6.5) + txt(18.5, 56.8, '1', 6.5),
  ),
  futoshiki: G(
    `<rect x="8" y="8" width="18" height="18"/><rect x="38" y="8" width="18" height="18"/><rect x="8" y="38" width="18" height="18"/><rect x="38" y="38" width="18" height="18" stroke-dasharray="3 3"/>` +
      `<path d="M29 13l6 4-6 4" stroke="var(--accent)" stroke-width="3"/><path d="M13 29l4 6 4-6" stroke="var(--accent)" stroke-width="3"/>` +
      txt(17, 21.5, '2', 13) + txt(47, 21.5, '1', 13) + txt(17, 51.5, '1', 13),
  ),
  hashi: G(
    `<path d="M22 13h20M22 19h20" stroke="var(--accent)"/><path d="M50 24v20"/>` +
      `<circle cx="14" cy="16" r="8" fill="var(--icon-bg, var(--bg))"/><circle cx="50" cy="16" r="8" fill="var(--icon-bg, var(--bg))"/><circle cx="50" cy="52" r="8" fill="var(--icon-bg, var(--bg))"/>` +
      txt(14, 20.5, '2', 12) + txt(50, 20.5, '3', 12) + txt(50, 56.5, '1', 12),
  ),
  takuzu: G(
    [
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 0],
    ]
      .map((row, r) =>
        row
          .map((v, c) => {
            const acc = r === 1 && c === 1;
            const col = acc ? 'var(--accent)' : 'currentColor';
            return `<circle cx="${16 + c * 16}" cy="${16 + r * 16}" r="6.5" ${v ? `fill="${col}"` : ''} stroke="${col}"/>`;
          })
          .join(''),
      )
      .join(''),
  ),
  kakuro: G(
    `<rect x="8" y="8" width="48" height="48"/><path d="M24 8v48M40 8v48M8 24h48M8 40h48" stroke-width="1.5"/>` +
      `<rect x="8" y="8" width="16" height="16" fill="currentColor"/><rect x="24" y="8" width="16" height="16" fill="currentColor"/><rect x="8" y="24" width="16" height="16" fill="currentColor"/>` +
      `<path d="M24 8L40 24M8 24L24 40" stroke="var(--icon-bg, var(--bg))" stroke-width="1.5"/>` +
      txt(36.5, 15, '6', 7.5, 'var(--icon-bg, var(--bg))') + txt(12, 36.5, '4', 7.5, 'var(--icon-bg, var(--bg))') +
      txt(48, 36.5, '2', 12) + txt(32, 52.5, '1', 12, 'var(--accent)'),
  ),
  akari: G(
    `<circle cx="32" cy="26" r="11" stroke="var(--accent)" fill="var(--accent)" fill-opacity=".18"/><path d="M27 41h10M28.5 46h7M30.5 51h3" stroke="var(--accent)"/>` +
      `<path d="M32 6v6M13 13l4 4M51 13l-4 4M7 28h6M51 28h6"/>`,
  ),
  tents: G(
    `<path d="M5 54h54"/><path d="M8 54L24 24l16 30z" stroke="var(--accent)" fill="var(--accent)" fill-opacity=".18"/><path d="M24 40l-5 14M24 40l5 14" stroke="var(--accent)"/>` +
      `<path d="M51 12l-8 15h16zM51 24l-10 17h20z"/><path d="M51 41v13"/>`,
  ),
};

export const UI_ICONS = {
  back: U('<path d="M15 5l-7 7 7 7"/>'),
  settings: U('<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>'),
  stats: U('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
  pause: U('<path d="M9 5v14M15 5v14"/>'),
  play: U('<path d="M8 5l11 7-11 7z"/>'),
  close: U('<path d="M6 6l12 12M18 6L6 18"/>'),
  rules: U('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.5 2.5 0 114.6 1.3c-.8 1.2-2.1 1.5-2.1 3M12 17v.01"/>'),
  shuffle: U('<path d="M3 7h3.5c3 0 4 1.5 5.5 5s2.5 5 5.500 5H21M3 17h3.5c1.5 0 2.500-.5 3.300-1.600M21 7h-3.500c-1.500 0-2.500.5-3.300 1.600M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  undo: U('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  redo: U('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'),
  eraser: U('<path d="M20 20H9l-5-5a2 2 0 010-3l8-8a2 2 0 013 0l5 5a2 2 0 010 3l-7 8"/><path d="M7 11l6 6"/>'),
  pencil: U('<path d="M4 20l1-4L16 5a2 2 0 013 3L8 19z"/><path d="M14 7l3 3"/>'),
  bulb: U('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-4 10.500V15h8v-1.500A6 6 0 0012 3z"/>'),
  sparkle: U('<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z"/><path d="M19 17v4M17 19h4"/>'),
  plus: U('<path d="M12 5v14M5 12h14"/>'),
  minus: U('<path d="M5 12h14"/>'),
  square: U('<rect x="5" y="5" width="14" height="14" rx="1"/>'),
  pen: U('<path d="M15 4l5 5L9 20l-5.500 1L5 15.500z"/><path d="M13 6l5 5"/>'),
  cross: U('<path d="M6 6l12 12M18 6L6 18"/>'),
  star: U('<path d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.800L12 16.800 6.800 19.600l1-5.800L3.500 9.700l5.900-.8z"/>'),
  chevron: U('<path d="M6 9l6 6 6-6"/>'),
  check: U('<path d="M5 12.5l4.500 4.500L19 7.500"/>'),
};

export const gameIcon = (id) => GAME_ICONS[id] ?? '';
export const uiIcon = (name) => UI_ICONS[name] ?? '';
