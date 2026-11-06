import { readFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from 'electron';
import { resolveLanguage, setLanguage } from '@kinglet/core';
import type { LicenseState } from '../shared/types';
import { BUY_URL, LEMON_SQUEEZY, ORDERS_URL } from './license-config';
import { LicenseService, type Sealer } from './license';

/** The OS keyring through Electron (KWallet, GNOME Keyring), like the Vercel and GitHub tokens. */
const keyring: Sealer = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
};

/**
 * The installed app asks for a license; the development build doesn't, unless KINGLET_LICENSE_API
 * points it at a (test) License API. The installed app ignores both test variables: it only talks
 * to Lemon Squeezy, about Kinglet's own store and product.
 */
export function createLicense() {
  const test = !app.isPackaged && !!process.env.KINGLET_LICENSE_API;
  const [storeId, productId] = (process.env.KINGLET_LICENSE_PRODUCT ?? '').split(':').map(Number);
  const name = (() => {
    try {
      return `${userInfo().username}@${hostname()}`;
    } catch {
      return hostname();
    }
  })();
  return new LicenseService({
    file: join(app.getPath('userData'), 'license.json'),
    product: test && storeId && productId ? { storeId, productId } : LEMON_SQUEEZY,
    instanceName: name,
    enforced: app.isPackaged || test,
    seal: keyring,
    api: test ? process.env.KINGLET_LICENSE_API : undefined,
  });
}

/** The language the user chose in Kinglet's settings (the window opens before the app). */
function applyLanguage() {
  let pref: string | null = null;
  try {
    pref = (JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')) as { language?: string }).language ?? null;
  } catch {
    /* first launch */
  }
  setLanguage(resolveLanguage(pref, app.getLocale()));
  return resolveLanguage(pref, app.getLocale());
}

/**
 * Without a valid license, this window is all there is: Kinglet's own window (and its IPC) is only
 * created once a key is activated (`onUnlocked`). Closing it quits.
 */
export async function openLicenseWindow(license: LicenseService, initial: LicenseState, onUnlocked: () => void) {
  const lang = applyLanguage();
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 520,
    height: 600,
    resizable: false,
    maximizable: false,
    backgroundColor: '#0A0A0B',
    title: 'Kinglet',
    icon: join(__dirname, '../../build/icon.png'),
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/license.js'), sandbox: true, contextIsolation: true },
  });
  let state = initial;
  let unlocked = false;

  const handlers: [string, (...args: never[]) => unknown][] = [
    ['license:init', () => ({ state, lang, version: app.getVersion() })],
    [
      'license:activate',
      async (_e: unknown, key: string) => {
        state = await license.activate(String(key ?? ''));
        if (license.allowed(state)) {
          unlocked = true;
          // A moment to show "Activated", then the app.
          setTimeout(() => {
            cleanup();
            onUnlocked();
            win.close();
          }, 900);
        }
        return state;
      },
    ],
  ];
  for (const [channel, fn] of handlers) ipcMain.handle(channel, fn as never);
  const open = (_e: unknown, which: string) => void shell.openExternal(which === 'orders' ? ORDERS_URL : BUY_URL);
  ipcMain.on('license:open', open);
  const cleanup = () => {
    for (const [channel] of handlers) ipcMain.removeHandler(channel);
    ipcMain.removeListener('license:open', open);
  };
  win.on('closed', () => {
    if (!unlocked) {
      cleanup();
      app.quit();
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/license/index.html`);
  else await win.loadFile(join(__dirname, '../renderer/license/index.html'));
  return win;
}
