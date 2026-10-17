// Curseur double (min/max) sur les tranches Elo Lichess.
import { BAND_EDGES, rangeLabel } from '../settings.js';

const TICKS = BAND_EDGES.map((e, i) => (i === BAND_EDGES.length - 1 ? '2500+' : i === 0 ? '0' : String(e)));

/**
 * el: conteneur ; value: [a, b] ; onChange([a, b]) appelé au relâchement.
 * accent: couleur CSS du segment sélectionné.
 */
export function rangeSlider(el, { label, value, accent, onChange }) {
  const max = BAND_EDGES.length - 1;
  let [a, b] = value;
  el.classList.add('rs');
  el.style.setProperty('--rs-accent', accent);
  el.innerHTML = `
    <div class="rs-head"><span class="rs-label">${label}</span><span class="rs-value"></span></div>
    <div class="rs-track">
      <div class="rs-fill"></div>
      <input type="range" min="0" max="${max}" step="1" value="${a}" class="rs-a" aria-label="${label} : minimum">
      <input type="range" min="0" max="${max}" step="1" value="${b}" class="rs-b" aria-label="${label} : maximum">
    </div>
    <div class="rs-ticks">${TICKS.map((t, i) => `<span style="left:${(i / max) * 100}%">${i % 2 === 0 || i === max ? t : ''}</span>`).join('')}</div>`;
  const ia = el.querySelector('.rs-a'), ib = el.querySelector('.rs-b');
  const fill = el.querySelector('.rs-fill'), out = el.querySelector('.rs-value');
  const paint = () => {
    fill.style.left = (a / max) * 100 + '%';
    fill.style.width = ((b - a) / max) * 100 + '%';
    out.textContent = rangeLabel([a, b]);
  };
  ia.oninput = () => { a = Math.min(+ia.value, b - 1); ia.value = a; paint(); };
  ib.oninput = () => { b = Math.max(+ib.value, a + 1); ib.value = b; paint(); };
  ia.onchange = ib.onchange = () => onChange([a, b]);
  paint();
  return { set([x, y]) { a = x; b = y; ia.value = a; ib.value = b; paint(); } };
}
