// Runs inside every emulated device page. Keeps scroll positions in sync across devices.
import { ipcRenderer } from 'electron';

let suppressUntil = 0;
let frame = 0;

const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

window.addEventListener(
  'scroll',
  () => {
    if (Date.now() < suppressUntil) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const max = maxScroll();
      ipcRenderer.send('device:scroll', max > 0 ? window.scrollY / max : 0);
    });
  },
  { passive: true },
);

ipcRenderer.on('device:scroll-to', (_e, ratio: number) => {
  suppressUntil = Date.now() + 200;
  window.scrollTo({ top: Math.round(ratio * maxScroll()), behavior: 'instant' });
});
