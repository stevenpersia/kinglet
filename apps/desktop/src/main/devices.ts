import { join } from 'node:path';
import { BaseWindow, WebContentsView, ipcMain, session, type Session } from 'electron';
import type { DevicePreset, DeviceSlot, PreviewEvent } from '../shared/types';

export const PREVIEW_PARTITION = 'persist:parakeet-preview';

interface DeviceEntry {
  preset: DevicePreset;
  view: WebContentsView;
  scale: number;
  attached: boolean;
}

const errorPage = (url: string, error: string) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><meta name="viewport" content="width=device-width">
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#111113;color:#A1A1AA;font:15px system-ui;text-align:center;padding:24px;box-sizing:border-box">
<div><div style="color:#EDEDEF;font-weight:600;margin-bottom:8px">Rien à afficher</div>
<div style="font-family:monospace;font-size:13px;margin-bottom:12px">${url.replace(/</g, '&lt;')}</div>
<div>${error.replace(/</g, '&lt;')}</div></div></body>`);

/**
 * One WebContentsView per emulated device, laid over the slots drawn by the UI.
 * Emulation goes through the Chrome DevTools Protocol (the same engine as Chrome's device mode).
 */
export class DeviceManager {
  private devices = new Map<string, DeviceEntry>();
  private url: string | null = null;
  private scrollSync = true;
  readonly session: Session = session.fromPartition(PREVIEW_PARTITION);

  constructor(
    private window: BaseWindow,
    private presets: DevicePreset[],
    private emit: (e: PreviewEvent) => void,
  ) {
    ipcMain.on('device:scroll', (event, ratio: number) => {
      if (process.env.PARAKEET_DEBUG) console.log(`[scroll] from ${event.sender.id} ratio ${ratio}`);
      if (!this.scrollSync) return;
      for (const d of this.devices.values()) {
        if (d.view.webContents.id !== event.sender.id) d.view.webContents.send('device:scroll-to', ratio);
      }
    });
  }

  get currentUrl() {
    return this.url;
  }

  entries() {
    return [...this.devices.values()];
  }

  setScrollSync(on: boolean) {
    this.scrollSync = on;
  }

  setActive(ids: string[]) {
    for (const [id, d] of this.devices) {
      if (!ids.includes(id)) {
        if (d.attached) this.window.contentView.removeChildView(d.view);
        d.view.webContents.close();
        this.devices.delete(id);
      }
    }
    for (const id of ids) {
      if (this.devices.has(id)) continue;
      const preset = this.presets.find((p) => p.id === id);
      if (preset) this.create(preset);
    }
  }

  private create(preset: DevicePreset) {
    const view = new WebContentsView({
      webPreferences: {
        partition: PREVIEW_PARTITION,
        preload: join(__dirname, '../preload/device.js'),
        sandbox: true,
        contextIsolation: true,
      },
    });
    view.setBackgroundColor('#111113');
    if (preset.radius) view.setBorderRadius(Math.round(preset.radius * 0.5));
    const entry: DeviceEntry = { preset, view, scale: 0.5, attached: false };
    this.devices.set(preset.id, entry);

    const wc = view.webContents;
    if (preset.userAgent) wc.setUserAgent(preset.userAgent);
    try {
      wc.debugger.attach('1.3');
    } catch (e) {
      console.error(`[${preset.id}] debugger attach failed`, e);
    }
    void this.emulate(entry);

    wc.on('did-finish-load', () => {
      if (wc.getURL().startsWith('data:')) return;
      if (preset.id === [...this.devices.keys()][0]) this.emit({ type: 'loaded', url: wc.getURL() });
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* aborted */) return;
      const hint = code === -102 ? 'Aucun serveur ne répond. Lance ton serveur de dev (pnpm dev).' : `${desc} (${code})`;
      void wc.loadURL(errorPage(url, hint));
      if (preset.id === [...this.devices.keys()][0]) this.emit({ type: 'failed', url, error: hint });
    });
    wc.on('did-navigate', (_e, url) => {
      if (!url.startsWith('data:') && preset.id === [...this.devices.keys()][0]) this.emit({ type: 'navigated', url });
    });
    // Links that open a new window stay inside the device.
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url);
      return { action: 'deny' };
    });

    if (this.url) void wc.loadURL(this.url);
  }

  private async emulate(d: DeviceEntry) {
    const { preset, scale } = d;
    const dbg = d.view.webContents.debugger;
    if (!dbg.isAttached()) return;
    const send = (method: string, params: object) =>
      dbg.sendCommand(method, params).catch((e: Error) => console.error(`[${preset.id}] ${method}`, e.message));
    await send('Emulation.setDeviceMetricsOverride', {
      width: preset.width,
      height: preset.height,
      deviceScaleFactor: preset.dpr,
      mobile: preset.mobile,
      scale,
      screenWidth: preset.width,
      screenHeight: preset.height,
      screenOrientation: { type: 'portraitPrimary', angle: 0 },
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: preset.touch, maxTouchPoints: preset.touch ? 5 : 1 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: preset.touch, configuration: preset.touch ? 'mobile' : 'desktop' });
    if (preset.userAgent) {
      const platform = preset.userAgent.includes('Android') ? 'Linux armv81' : preset.userAgent.includes('iPhone') ? 'iPhone' : 'MacIntel';
      await send('Emulation.setUserAgentOverride', { userAgent: preset.userAgent, platform });
    }
  }

  setLayout(slots: DeviceSlot[]) {
    for (const slot of slots) {
      const d = this.devices.get(slot.id);
      if (!d) continue;
      d.view.setBounds({ x: Math.round(slot.x), y: Math.round(slot.y), width: Math.round(slot.width), height: Math.round(slot.height) });
      if (d.preset.radius) d.view.setBorderRadius(Math.round(d.preset.radius * slot.scale));
      if (!d.attached) {
        this.window.contentView.addChildView(d.view);
        d.attached = true;
      }
      if (Math.abs(d.scale - slot.scale) > 0.001) {
        d.scale = slot.scale;
        void this.emulate(d);
      }
    }
  }

  async navigate(url: string) {
    this.url = url;
    await Promise.all(this.entries().map((d) => d.view.webContents.loadURL(url).catch(() => undefined)));
  }

  reload() {
    for (const d of this.devices.values()) {
      if (d.view.webContents.getURL().startsWith('data:') && this.url) void d.view.webContents.loadURL(this.url);
      else d.view.webContents.reloadIgnoringCache();
    }
  }
}
