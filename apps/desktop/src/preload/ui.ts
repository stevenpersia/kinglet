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
  analyze: (url, opts) => ipcRenderer.invoke('page:analyze', url, opts ?? {}),
  crawl: (url, opts) => ipcRenderer.invoke('site:crawl', url, opts ?? {}),
  sharePreviews: (url) => ipcRenderer.invoke('share:previews', url),
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  mcpInfo: () => ipcRenderer.invoke('mcp:info'),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onEvent: (cb) => {
    const listener = (_e: unknown, ev: PreviewEvent) => cb(ev);
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
};

contextBridge.exposeInMainWorld('parakeet', api);
