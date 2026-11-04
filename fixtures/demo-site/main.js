import { headline } from './content.js';

document.getElementById('headline').textContent = headline;

const set = (id, v) => (document.getElementById(id).textContent = String(v));
function diag() {
  set('d-width', `${innerWidth} px`);
  set('d-dpr', devicePixelRatio);
  set('d-pointer', matchMedia('(pointer: coarse)').matches ? 'oui' : 'non');
  set('d-hover', matchMedia('(hover: none)').matches ? 'oui' : 'non');
  set('d-touch', navigator.maxTouchPoints);
  const ua = navigator.userAgent;
  // iPadOS Safari announces itself as a Mac: touch points give it away.
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  set('d-ua', /iPhone/.test(ua) ? 'iPhone Safari' : ipad ? 'iPad Safari' : /Android/.test(ua) ? 'Android Chrome' : 'Desktop');
}
diag();
addEventListener('resize', diag);

const grid = document.getElementById('grid');
grid.innerHTML = Array.from({ length: 24 }, (_, i) => `<article><div class="img"></div><b>Pièce n° ${i + 1}</b><span>${30 + i * 4} €</span></article>`).join('');

if (import.meta.hot) import.meta.hot.accept('./content.js', (m) => (document.getElementById('headline').textContent = m.headline));
