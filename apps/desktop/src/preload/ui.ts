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
  thumbnail: () => ipcRenderer.invoke('preview:thumbnail'),
  logs: () => ipcRenderer.invoke('preview:logs'),
  openDevtools: (id) => ipcRenderer.send('preview:devtools', id),
  analyze: (url, opts) => ipcRenderer.invoke('page:analyze', url, opts ?? {}),
  crawl: (url, opts) => ipcRenderer.invoke('site:crawl', url, opts ?? {}),
  sharePreviews: (url) => ipcRenderer.invoke('share:previews', url),
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  mcpInfo: () => ipcRenderer.invoke('mcp:info'),
  vercel: {
    state: () => ipcRenderer.invoke('vercel:state'),
    connect: (token) => ipcRenderer.invoke('vercel:connect', token),
    refresh: () => ipcRenderer.invoke('vercel:refresh'),
    refreshProjects: () => ipcRenderer.invoke('vercel:projects'),
    generateBypass: (projectId) => ipcRenderer.invoke('vercel:bypass', projectId),
    disconnect: () => ipcRenderer.invoke('vercel:disconnect'),
  },
  claude: {
    state: () => ipcRenderer.invoke('claude:state'),
    install: () => ipcRenderer.invoke('claude:install'),
    uninstall: () => ipcRenderer.invoke('claude:uninstall'),
    markSeen: (projectId) => ipcRenderer.send('claude:seen', projectId),
  },
  projects: {
    pickFolder: () => ipcRenderer.invoke('projects:pick-folder'),
  },
  compare: (targets) => ipcRenderer.invoke('compare:run', targets),
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install'),
  },
  phone: {
    state: () => ipcRenderer.invoke('phone:state'),
    start: () => ipcRenderer.invoke('phone:start'),
    stop: () => ipcRenderer.invoke('phone:stop'),
    setFollow: (on) => ipcRenderer.invoke('phone:follow', on),
    setAddress: (address) => ipcRenderer.invoke('phone:address', address),
    qr: (url, local) => ipcRenderer.invoke('phone:qr', url, local),
  },
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onEvent: (cb) => {
    const listener = (_e: unknown, ev: PreviewEvent) => cb(ev);
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
};

contextBridge.exposeInMainWorld('parakeet', api);
