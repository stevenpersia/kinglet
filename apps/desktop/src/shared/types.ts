import type { CheckResult, CrawledPage, ImageProbe, Issue, PageMeta, ShareFix, SharePreviews, SiteFiles, VercelDeployment, VercelProject, VercelTeam, VercelUser } from '@parakeet/core';

export interface DevicePreset {
  id: string;
  label: string;
  /** CSS viewport size, portrait. */
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  touch: boolean;
  userAgent: string;
  /** Screen corner radius in CSS px (0 for desktop). */
  radius: number;
  kind: 'phone' | 'tablet' | 'desktop';
}

/** Where a device view must be drawn, in window coordinates (CSS px). */
export interface DeviceSlot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** A site you work on: one tab. Optionally a Vercel project and a local folder. */
export interface Project {
  /** Vercel project id, or "local:<origin>" for a site that is not on Vercel. */
  id: string;
  name: string;
  vercelProjectId: string | null;
  teamId: string | null;
  /** Origin of the local dev server, to come back to it from preview or prod. */
  localOrigin: string | null;
  /** Project folder on disk: links Claude Code sessions (by their cwd) to this project. */
  folder: string | null;
  /** Last page shown, restored when the tab is opened again. */
  lastUrl: string | null;
  /** The site's favicon (data URL), seen the last time the project was shown. */
  favicon?: string | null;
}

export interface Settings {
  projects: Project[];
  /** Tabs, in order. */
  openIds: string[];
  activeId: string | null;
  recentUrls: string[];
  active: string[];
  scrollSync: boolean;
  landscape: boolean;
  /** Slow network and CPU, applied to phones and tablets (screens stay at full speed). */
  throttle: Throttle;
  language: Language;
}

export type Language = 'en' | 'fr';

export interface Throttle {
  network: 'off' | '4g' | '3g';
  /** CPU slowdown factor: 1 (off), 4 (mid-range phone), 6 (low-end phone). */
  cpu: 1 | 4 | 6;
}

/** One line of a device's console or network log. */
export interface DeviceLog {
  id: number;
  at: number;
  deviceId: string;
  source: 'console' | 'network';
  level: 'error' | 'warning' | 'info' | 'debug';
  text: string;
  /** Script (console) or request (network) URL. */
  url?: string;
  line?: number;
  /** HTTP status (network), 0 when the request failed without a response. */
  status?: number;
  method?: string;
  resourceType?: string;
}

/** How long a page took to load on one device, and what it weighed. */
export interface DevicePerf {
  deviceId: string;
  url: string;
  loadMs: number;
  /** DOMContentLoaded. */
  domMs: number;
  /** Bytes transferred (document + resources). */
  bytes: number;
  requests: number;
}

export interface InitState {
  presets: DevicePreset[];
  settings: Settings;
  url: string | null;
  detectedFrom: string | null;
  platform: { sessionType: string; electron: string; chrome: string; version: string; isDev: boolean };
}

export interface ShareReport {
  meta: PageMeta;
  image: ImageProbe | null;
  issues: Issue[];
}

/** Everything known about the current page: share tags, site files, the 24 checks. */
export interface AnalyzeReport {
  url: string;
  share: ShareReport;
  site: SiteFiles | null;
  checks: CheckResult[];
  score: { passed: number; total: number };
}

export type { CheckResult, CrawledPage, ShareFix, SharePreviews, VercelDeployment, VercelProject };

export type VercelTeamProject = VercelProject & { teamId: string | null };

export interface VercelState {
  connected: boolean;
  user: VercelUser | null;
  teams: VercelTeam[];
  /** Projects of every team (personal account: teamId null). */
  projects: VercelTeamProject[];
  /** Deployments of the projects open in tabs, by Vercel project id. */
  deployments: Record<string, VercelDeployment[]>;
  error: string | null;
  /** keyring: encrypted by the system keyring; basic: weak fixed key; none: clear text. */
  storage: 'keyring' | 'basic' | 'none';
  syncedAt: number | null;
}

export type EnvId = 'local' | 'preview' | 'prod';

/** One Claude Code hook event, attributed to a project by the session's folder. */
export interface ClaudeEvent {
  at: number;
  projectId: string | null;
  sessionId: string;
  kind: 'start' | 'prompt' | 'tool' | 'waiting' | 'stop' | 'error' | 'end';
  tool?: string;
  /** File touched by Edit / Write. */
  file?: string;
  /** Prompt, notification message, or error. */
  text?: string;
}

/** What Claude is doing on a project, from its Claude Code sessions. */
export interface ClaudeProjectState {
  status: 'working' | 'waiting' | 'done' | 'idle';
  /** When the current status started. */
  since: number;
  lastAt: number;
  prompt: string | null;
  lastAction: string | null;
  /** Files edited during the current / last task. */
  files: string[];
  /** The user looked at the result of the last task. */
  seen: boolean;
  events: ClaudeEvent[];
}

export interface ClaudeHookState {
  installed: boolean;
  /** Claude Code settings file the hooks live in. */
  file: string;
  error: string | null;
}

export interface PhoneState {
  running: boolean;
  port: number | null;
  addresses: { address: string; iface: string }[];
  address: string | null;
  follow: boolean;
  clients: { id: number; userAgent: string; since: number }[];
}

export interface UpdateState {
  current: string;
  kind: 'appimage' | 'pacman' | 'other' | 'unknown';
  status: 'unsupported' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  latest: string | null;
  percent: number | null;
  error: string | null;
  checkedAt: number | null;
}

export interface PhoneQr {
  url: string;
  svg: string;
  /** The URL carries the Vercel bypass secret (protected preview). */
  withSecret: boolean;
}

export interface CompareColumn {
  env: EnvId;
  label: string;
  url: string;
  status: number | null;
  error: string | null;
  values: Record<string, string | null>;
  score: { passed: number; total: number } | null;
}

export interface ShareStudio {
  previews: SharePreviews;
  fix: ShareFix;
}

export type ShortcutAction = 'reload' | 'focus-url' | 'palette' | 'toggle-scroll-sync' | 'toggle-landscape' | 'settings' | 'switcher' | 'overview' | `tab-${number}`;

/** A call made by Claude Code through the MCP server. */
export interface McpActivity {
  at: number;
  tool: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface McpInfo {
  /** Command to register Parakeet in Claude Code. */
  command: string;
  /** How Claude Code launches the server (shown for information). */
  launch: string;
  activity: McpActivity[];
}

export type PreviewEvent =
  | { type: 'loaded'; url: string }
  | { type: 'loading'; url: string }
  | { type: 'failed'; url: string; error: string }
  | { type: 'navigated'; url: string }
  | { type: 'shortcut'; action: ShortcutAction }
  | { type: 'window'; maximized: boolean }
  | { type: 'settings'; settings: Settings }
  | { type: 'mcp'; activity: McpActivity }
  | { type: 'vercel'; state: VercelState }
  | { type: 'phone'; state: PhoneState }
  | { type: 'update'; state: UpdateState }
  | { type: 'claude'; projects: Record<string, ClaudeProjectState> }
  | { type: 'logs'; entries: DeviceLog[]; cleared: string[] }
  | { type: 'perf'; perf: DevicePerf }
  | { type: 'favicon'; url: string; pageUrl: string };

export interface ParakeetApi {
  init(): Promise<InitState>;
  navigate(url: string): Promise<void>;
  reload(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  setLayout(slots: DeviceSlot[]): void;
  /** Hide the native device views (e.g. on another section). */
  setPreviewsVisible(visible: boolean): void;
  /**
   * Native views always draw above the UI. Before showing a menu or a dialog over the stage,
   * freeze: views are captured as images and hidden. Returns one data URL per device id.
   */
  freeze(): Promise<Record<string, string>>;
  unfreeze(): void;
  /** Small capture of the page on the first phone (data URL). */
  thumbnail(): Promise<string | null>;
  /** Console and network log of every device since its last page load. */
  logs(): Promise<DeviceLog[]>;
  openDevtools(deviceId: string): void;
  /** Read the page like the bots do, measure it in the devices, run the checks. */
  analyze(url: string, opts?: { refreshSite?: boolean }): Promise<AnalyzeReport>;
  /** Pages of the site (crawl + sitemap + links of the rendered page). Cached per origin. */
  crawl(url: string, opts?: { force?: boolean }): Promise<CrawledPage[]>;
  /** The 7 platform previews (one fetch per bot) and the suggested fix. */
  sharePreviews(url: string): Promise<ShareStudio>;
  copy(text: string): void;
  mcpInfo(): Promise<McpInfo>;
  vercel: {
    state(): Promise<VercelState>;
    connect(token: string): Promise<VercelState>;
    refresh(): Promise<VercelState>;
    refreshProjects(): Promise<VercelState>;
    generateBypass(projectId: string): Promise<VercelState>;
    disconnect(): Promise<VercelState>;
  };
  /** The same path on each environment: tags side by side and checks score. */
  compare(targets: { env: EnvId; label: string; url: string }[]): Promise<CompareColumn[]>;
  claude: {
    state(): Promise<{ hooks: ClaudeHookState; projects: Record<string, ClaudeProjectState> }>;
    /** Add Parakeet's hooks to ~/.claude/settings.json (a backup is kept). */
    install(): Promise<ClaudeHookState>;
    uninstall(): Promise<ClaudeHookState>;
    /** The user looked at the result of the last task on this project. */
    markSeen(projectId: string): void;
  };
  projects: {
    /** Folder picker; also reads the folder's Vercel link (.vercel/project.json). */
    pickFolder(): Promise<{ folder: string; vercelProjectId: string | null } | null>;
  };
  openExternal(url: string): void;
  update: {
    state(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    install(): void;
  };
  phone: {
    state(): Promise<PhoneState>;
    start(): Promise<PhoneState>;
    stop(): Promise<PhoneState>;
    setFollow(on: boolean): Promise<PhoneState>;
    setAddress(address: string): Promise<PhoneState>;
    /** QR for the current page: through the local proxy (local), or the URL itself (preview, prod). */
    qr(url: string, local: boolean): Promise<PhoneQr>;
  };
  windowControl(action: 'minimize' | 'maximize' | 'close'): void;
  onEvent(cb: (e: PreviewEvent) => void): () => void;
}
