import type { DevicePreset, DeviceSlot, InitState, ParakeetApi, ShareReport } from '../shared/types';

declare global {
  interface Window {
    parakeet: ParakeetApi;
  }
}

const api = window.parakeet;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let state: InitState;
let active: string[] = [];
const BEZEL: Record<DevicePreset['kind'], number> = { phone: 6, tablet: 10, desktop: 8 };
const LABEL_H = 26;
const GAP = 44;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/* ---------- devices ---------- */

function renderChips() {
  const chips = $('device-chips');
  chips.innerHTML = '';
  for (const p of state.presets) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(active.includes(p.id)));
    b.innerHTML = `${escapeHtml(p.label)} <span class="w">${p.width}</span>`;
    b.onclick = async () => {
      const next = active.includes(p.id) ? active.filter((x) => x !== p.id) : [...active, p.id];
      if (next.length === 0) return;
      active = state.presets.filter((x) => next.includes(x.id)).map((x) => x.id);
      await api.setActive(active);
      renderChips();
      renderStage();
    };
    chips.appendChild(b);
  }
}

function renderStage() {
  const stage = $('stage');
  stage.innerHTML = '';
  for (const id of active) {
    const p = state.presets.find((x) => x.id === id)!;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="device" data-id="${p.id}"><div class="bezel"><div class="slot"></div></div><span class="device-label">${escapeHtml(p.label)} · ${p.width} × ${p.height}</span></div>`,
    );
  }
  layout();
}

function layout() {
  const stage = $('stage');
  const cs = getComputedStyle(stage);
  const innerW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const innerH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - LABEL_H - 10;
  const presets = active.map((id) => state.presets.find((x) => x.id === id)!);
  if (!presets.length) return;

  const bezels = presets.map((p) => BEZEL[p.kind] * 2);
  const byHeight = Math.min(...presets.map((p, i) => (innerH - bezels[i]!) / p.height));
  const byWidth = (innerW - GAP * (presets.length - 1) - bezels.reduce((a, b) => a + b, 0)) / presets.reduce((a, p) => a + p.width, 0);
  const scale = Math.max(0.15, Math.min(1, byHeight, byWidth));

  // Pass 1: size every device. Pass 2: measure. Devices are centred, so a slot's
  // position depends on the size of all the others.
  const sized = [...stage.querySelectorAll<HTMLElement>('.device')].map((el) => {
    const p = state.presets.find((x) => x.id === el.dataset.id)!;
    const pad = BEZEL[p.kind];
    const bezel = el.querySelector<HTMLElement>('.bezel')!;
    const slot = el.querySelector<HTMLElement>('.slot')!;
    const w = Math.round(p.width * scale);
    const h = Math.round(p.height * scale);
    slot.style.width = `${w}px`;
    slot.style.height = `${h}px`;
    slot.style.borderRadius = `${Math.round(p.radius * scale)}px`;
    bezel.style.padding = `${pad}px`;
    bezel.style.borderRadius = p.kind === 'desktop' ? '8px' : `${Math.round(p.radius * scale) + pad}px`;
    return { p, slot, w, h };
  });
  const slots: DeviceSlot[] = sized.map(({ p, slot, w, h }) => {
    const r = slot.getBoundingClientRect();
    return { id: p.id, x: r.left, y: r.top, width: w, height: h, scale: w / p.width };
  });
  api.setLayout(slots);
}

/* ---------- inspector ---------- */

const formatBytes = (b: number) => (b < 1024 ? `${b} o` : `${Math.round(b / 1024)} Ko`);

let shareRequest = 0;
async function refreshInspector(url: string) {
  const id = ++shareRequest;
  let report: ShareReport;
  try {
    report = await api.readShare(url);
  } catch (e) {
    $('insp-empty').textContent = `Lecture impossible : ${(e as Error).message}`;
    return;
  }
  if (id !== shareRequest) return;
  const { meta, image, issues } = report;
  $('insp-empty').hidden = true;
  $('insp-content').hidden = false;

  const title = meta.title ?? '';
  const desc = meta.description ?? '';
  $('meta-title').textContent = title || '— absent —';
  $('meta-desc').textContent = desc || '— absente —';
  const tc = $('title-count');
  tc.textContent = `${title.length} / 60`;
  tc.classList.toggle('over', title.length > 60 || !title);
  const dc = $('desc-count');
  dc.textContent = `${desc.length} / 160`;
  dc.classList.toggle('over', desc.length > 160 || !desc);

  const errors = issues.filter((i) => i.severity === 'error').length;
  $('share-score').textContent = issues.length ? `${errors} erreur${errors > 1 ? 's' : ''} · ${issues.length - errors} alerte${issues.length - errors > 1 ? 's' : ''}` : 'tout est bon';
  $('issues').innerHTML = issues.length
    ? issues
        .map((i) => `<li><span class="dot ${i.severity}"></span><div><span class="tag">${escapeHtml(i.tag)}</span><span class="msg">${escapeHtml(i.message)}</span></div></li>`)
        .join('')
    : '<li><span class="dot ok"></span><div><span class="msg">Toutes les balises de partage sont en place.</span></div></li>';

  $('link-title').textContent = meta.og['title'] ?? title;
  $('link-desc').textContent = meta.og['description'] ?? desc;
  const site = $('link-site');
  site.textContent = meta.og['site_name'] ?? 'og:site_name absent';
  site.classList.toggle('missing', !meta.og['site_name']);
  $('link-img').style.backgroundImage = image?.ok && meta.ogImageUrl ? `url("${meta.ogImageUrl}")` : 'none';
  $('fetch-info').textContent = `Lu comme ${meta.fetchedAs} · HTTP ${meta.status} · ${meta.durationMs} ms${image?.ok ? ` · image ${image.width}×${image.height}, ${formatBytes(image.bytes ?? 0)}` : ''}`;
}

/* ---------- wiring ---------- */

function setUrl(url: string | null) {
  ($('url') as HTMLInputElement).value = url ?? '';
}

async function main() {
  state = await api.init();
  active = state.active;
  setUrl(state.url);
  $('url-status').textContent = state.url ? (state.detectedFrom ?? '') : 'aucun serveur détecté';
  $('st-server').textContent = state.url ? `Serveur · ${state.url.replace(/\/$/, '')}` : 'Aucun serveur local détecté (ports 3000, 5173, 4321…)';
  $('st-session').textContent = `Session · ${state.platform.sessionType}`;
  $('st-version').textContent = `Electron ${state.platform.electron} · Chromium ${state.platform.chrome.split('.')[0]}`;
  if (!state.url) $('insp-empty').textContent = 'Saisis l’adresse de ton serveur de dev en haut.';

  renderChips();
  renderStage();
  new ResizeObserver(() => layout()).observe($('stage'));

  $('urlbar').addEventListener('submit', (e) => {
    e.preventDefault();
    let url = ($('url') as HTMLInputElement).value.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) url = (/^(localhost|127\.|\[::1\])/.test(url) ? 'http://' : 'https://') + url;
    setUrl(url);
    $('url-status').textContent = '';
    void api.navigate(url);
  });
  $('reload').onclick = () => void api.reload();
  ($('scroll-sync') as HTMLInputElement).onchange = (e) => api.setScrollSync((e.target as HTMLInputElement).checked);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-win]')) b.onclick = () => api.windowControl(b.dataset.win as 'minimize');

  api.onPreview((e) => {
    if (e.type === 'loaded') {
      setUrl(e.url);
      $('url-status').textContent = 'chargé';
      void refreshInspector(e.url);
    } else if (e.type === 'failed') {
      $('url-status').textContent = 'injoignable';
      $('insp-empty').hidden = false;
      $('insp-content').hidden = true;
      $('insp-empty').textContent = e.error;
    } else if (e.type === 'navigated') setUrl(e.url);
  });
}

void main();
