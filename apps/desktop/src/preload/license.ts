import { contextBridge, ipcRenderer } from 'electron';
import type { LicenseState } from '../shared/types';

export interface LicenseApi {
  init(): Promise<{ state: LicenseState; lang: 'en' | 'fr'; version: string }>;
  activate(key: string): Promise<LicenseState>;
  open(which: 'buy' | 'orders' | 'terms' | 'privacy'): void;
}

const api: LicenseApi = {
  init: () => ipcRenderer.invoke('license:init'),
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  open: (which) => ipcRenderer.send('license:open', which),
};

contextBridge.exposeInMainWorld('kingletLicense', api);
