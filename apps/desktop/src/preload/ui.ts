import { contextBridge, ipcRenderer } from 'electron';
import type { ParakeetApi, PreviewEvent } from '../shared/types';

const api: ParakeetApi = {
  init: () => ipcRenderer.invoke('app:init'),
  navigate: (url) => ipcRenderer.invoke('preview:navigate', url),
  reload: () => ipcRenderer.invoke('preview:reload'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setLayout: (slots) => ipcRenderer.send('preview:layout', slots),
  setPreviewsVisible: (visible) => ipcRenderer.send('preview:visible', visible),
  freeze: () => ipcRenderer.invoke('preview:freeze'),
  unfreeze: () => ipcRenderer.send('preview:unfreeze'),
  openDevtools: (id) => ipcRenderer.send('preview:devtools', id),
  readShare: (url) => ipcRenderer.invoke('share:read', url),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onEvent: (cb) => {
    const listener = (_e: unknown, ev: PreviewEvent) => cb(ev);
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
};

contextBridge.exposeInMainWorld('parakeet', api);
