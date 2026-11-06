import { contextBridge, ipcRenderer } from 'electron';
import type { KingletApi, PreviewEvent } from '../shared/types';

const api: KingletApi = {
  init: () => ipcRenderer.invoke('app:init'),
  navigate: (url) => ipcRenderer.invoke('preview:navigate', url),
  reload: () => ipcRenderer.invoke('preview:reload'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setLayout: (slots) => ipcRenderer.send('preview:layout', slots),
  setPreviewsVisible: (visible) => ipcRenderer.send('preview:visible', visible),
  freeze: () => ipcRenderer.invoke('preview:freeze'),
  refreeze: () => ipcRenderer.invoke('preview:refreeze'),
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
    clone: (gitUrl) => ipcRenderer.invoke('projects:clone', gitUrl),
    changes: (projectId) => ipcRenderer.invoke('projects:changes', projectId),
    defaultParent: () => ipcRenderer.invoke('projects:default-parent'),
    pickParent: (current) => ipcRenderer.invoke('projects:pick-parent', current),
    create: (req) => ipcRenderer.invoke('projects:create', req),
    publishGitHub: (projectId, opts) => ipcRenderer.invoke('projects:publish-github', projectId, opts),
    publishVercel: (projectId, opts) => ipcRenderer.invoke('projects:publish-vercel', projectId, opts),
  },
  dev: {
    all: () => ipcRenderer.invoke('dev:all'),
    canStart: (projectId) => ipcRenderer.invoke('dev:can-start', projectId),
    start: (projectId) => ipcRenderer.invoke('dev:start', projectId),
    stop: (projectId) => ipcRenderer.invoke('dev:stop', projectId),
  },
  compare: (targets) => ipcRenderer.invoke('compare:run', targets),
  compareVisual: (targets, deviceId) => ipcRenderer.invoke('compare:visual', targets, deviceId),
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  security: {
    run: (url, opts) => ipcRenderer.invoke('security:run', url, opts ?? {}),
  },
  license: {
    state: () => ipcRenderer.invoke('license:state'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },
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
  localServers: () => ipcRenderer.invoke('detect:servers'),
  findFolder: (vercelProjectId) => ipcRenderer.invoke('projects:find-folder', vercelProjectId),
  elementAt: (deviceId, x, y) => ipcRenderer.invoke('preview:element-at', deviceId, x, y),
  setInspect: (on) => ipcRenderer.send('preview:inspect', on),
  feedback: {
    load: (projectId) => ipcRenderer.invoke('feedback:load', projectId),
    save: (projectId, pins) => ipcRenderer.invoke('feedback:save', projectId, pins),
  },
  github: {
    state: () => ipcRenderer.invoke('github:state'),
    createIssue: (repo, title, body) => ipcRenderer.invoke('github:issue', repo, title, body),
    pullRequests: (repo, branches) => ipcRenderer.invoke('github:prs', repo, branches),
    connect: (token) => ipcRenderer.invoke('github:connect', token),
    owners: () => ipcRenderer.invoke('github:owners'),
    disconnect: () => ipcRenderer.invoke('github:disconnect'),
  },
  chat: {
    cli: () => ipcRenderer.invoke('chat:cli'),
    installMcp: () => ipcRenderer.invoke('chat:install-mcp'),
  },
  term: {
    start: (projectId, cols, rows) => ipcRenderer.invoke('term:start', projectId, cols, rows),
    restart: (projectId, cols, rows) => ipcRenderer.invoke('term:restart', projectId, cols, rows),
    input: (projectId, data) => ipcRenderer.send('term:input', projectId, data),
    resize: (projectId, cols, rows) => ipcRenderer.send('term:resize', projectId, cols, rows),
    paste: (projectId, text, attachments) => ipcRenderer.invoke('term:paste', projectId, text, attachments),
    focus: (on) => ipcRenderer.send('term:focus', on),
  },
  audit: (url, opts) => ipcRenderer.invoke('site:audit', url, opts ?? {}),
  fillForms: (mode) => ipcRenderer.invoke('preview:fill-forms', mode),
  setTabOrder: (on) => ipcRenderer.send('preview:taborder', on),
  export: {
    shots: (full) => ipcRenderer.invoke('export:shots', full),
    frames: () => ipcRenderer.invoke('export:frames'),
    scroll: (ratio) => ipcRenderer.send('export:scroll', ratio),
    save: (data, name, kind) => ipcRenderer.invoke('export:save', data, name, kind),
    pdf: (shots, title, name) => ipcRenderer.invoke('export:pdf', shots, title, name),
    folder: (shots) => ipcRenderer.invoke('export:folder', shots),
  },
  history: {
    load: (projectId) => ipcRenderer.invoke('history:load', projectId),
    measure: (projectId, target) => ipcRenderer.invoke('history:measure', projectId, target ?? null),
  },
  review: {
    state: () => ipcRenderer.invoke('review:state'),
    open: (projectId) => ipcRenderer.invoke('review:open', projectId),
    close: (projectId) => ipcRenderer.invoke('review:close', projectId),
  },
  onEvent: (cb) => {
    const listener = (_e: unknown, ev: PreviewEvent) => cb(ev);
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
};

contextBridge.exposeInMainWorld('kinglet', api);
