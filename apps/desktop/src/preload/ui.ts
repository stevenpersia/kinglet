import { contextBridge, ipcRenderer } from 'electron';
import type { ParakeetApi, PreviewEvent } from '../shared/types';

const api: ParakeetApi = {
  init: () => ipcRenderer.invoke('app:init'),
  navigate: (url) => ipcRenderer.invoke('preview:navigate', url),
  reload: () => ipcRenderer.invoke('preview:reload'),
  setActive: (ids) => ipcRenderer.invoke('preview:set-active', ids),
  setLayout: (slots) => ipcRenderer.send('preview:layout', slots),
  setScrollSync: (on) => ipcRenderer.send('preview:scroll-sync', on),
  readShare: (url) => ipcRenderer.invoke('share:read', url),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onPreview: (cb) => {
    const listener = (_e: unknown, ev: PreviewEvent) => cb(ev);
    ipcRenderer.on('preview:event', listener);
    return () => ipcRenderer.removeListener('preview:event', listener);
  },
};

contextBridge.exposeInMainWorld('parakeet', api);
