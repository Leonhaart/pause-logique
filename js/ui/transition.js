import { svgEl, reducedMotion } from '../core/dom.js';

// Transition « zoom » : une copie de l'icône vole entre deux rectangles (technique FLIP).
export const pending = { zoomIn: null, back: null };

export function fly(markup, from, to, hideEl, duration = 440) {
  if (!from || !to || reducedMotion() || !to.width) return;
  const ghost = svgEl(markup, 'ghost-icon');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    transformOrigin: 'top left',
    zIndex: 60,
    pointerEvents: 'none',
    margin: 0,
  });
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const s = from.width / to.width;
  if (hideEl) hideEl.style.visibility = 'hidden';
  document.body.append(ghost);
  const done = () => {
    if (hideEl) hideEl.style.visibility = '';
    ghost.remove();
  };
  try {
    ghost
      .animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }],
        { duration, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
      .finished.then(done, done);
  } catch {
    done();
  }
}
