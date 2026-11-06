import type { Journey, JourneyRun, JourneyStep, Framework, OgImageInput, OgImageTags, SecurityReport, PrivacyReport, AxeViolation, Budget, BudgetResult, HreflangReport, SiteAudit, StructuredData, Vitals, CheckResult, CrawledPage, ImageProbe, Issue, PageMeta, ShareFix, SharePreviews, SiteFiles, VercelDeployment, VercelProject, VercelTeam, VercelUser } from '@kinglet/core';

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
  /** Added by the user in the settings. */
  custom?: boolean;
}

/** A device added in the settings. */
export interface CustomDevice {
  id: string;
  label: string;
  width: number;
  height: number;
  dpr: number;
  kind: DevicePreset['kind'];
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
  /** GitHub repository ("owner/name") Kinglet created for this project. */
  githubRepo?: string | null;
  /** The site's favicon (data URL), seen the last time the project was shown. */
  favicon?: string | null;
  /** Devices of this project, when the settings keep one list per project. */
  active?: string[];
  /** Devices listed in this project (ticked in the settings), when the settings keep one list per project. */
  listed?: string[];
  /** The Claude column was folded for this project (it is open by default). */
  claudeClosed?: boolean;
  /** Claude Code session of the panel, to resume it (here or in a terminal). */
  claudeSession?: string | null;
  /** Performance budgets of the project's pages. */
  budgets?: Budget[];
  /** The tools' settings of this project (emulation, network, region, keyboard, mocks, orientation, scroll sync), kept while another project is active. */
  tools?: ProjectTools;
  /** Measure the local site after each commit and each finished Claude task (history); on by default. */
  historyAuto?: boolean;
  /** Linear team the feedback of this project goes to (its id). */
  linearTeamId?: string | null;
  /** Recorded journeys (clicks, typing, navigation), played again on every device. */
  journeys?: Journey[];
}

export interface Settings {
  projects: Project[];
  /** Tabs, in order. */
  openIds: string[];
  activeId: string | null;
  recentUrls: string[];
  /** Devices shown side by side (among the listed ones). */
  active: string[];
  /** Devices listed in the projects (ticked in the settings); absent: all of them. */
  listed?: string[];
  scrollSync: boolean;
  landscape: boolean;
  /** Slow network and CPU, applied to phones and tablets (screens stay at full speed). */
  throttle: Throttle;
  /** Interface language; "system" follows the computer's. */
  language: Language;
  /** At launch: reopen the open projects, or show the projects page. */
  startup: 'restore' | 'projects';
  /** What a project opens on. */
  defaultSection: 'apercu' | 'partage' | 'checks' | 'deploiements';
  /** Read tags and run the checks after each page load. */
  autoAnalyze: boolean;
  customDevices: CustomDevice[];
  /** Order of the devices (ids); devices missing from it come after, in their own order. */
  deviceOrder: string[];
  /** One device list per project instead of one for all. */
  devicesPerProject: boolean;
  /** Dark mode, reduced motion, high contrast, on every device. */
  media: MediaPrefs;
  /** Every device without network. */
  offline: boolean;
  /** Simulated API responses. */
  mocks: ApiMock[];
  /** The first-run window was shown (done or skipped). */
  onboarded: boolean;
  /** Claude panel in the left bar. */
  claudePanel: boolean;
  /** No longer used: Claude asks in its own terminal (kept so older settings still read). */
  claudeAllowCommands: boolean;
  /** Language, time zone and position the devices pretend to have (all of them). */
  region: RegionPrefs;
  /** Per device, what differs from `region`. */
  regionPerDevice: Record<string, Partial<RegionPrefs>>;
  /** Bigger text (browser text size) and page zoom (200 %: the page reflows at half the width). */
  textSize: TextSize;
  /** On-screen keyboard open on phones and tablets. */
  keyboard: boolean;
  /** Public address of the review server (a tunnel), to share review links outside the local network. */
  reviewPublicUrl: string | null;
}

export interface RegionPrefs {
  /** BCP 47, e.g. "fr-FR"; null: the computer's. Sets navigator.language, Intl and Accept-Language. */
  locale: string | null;
  /** IANA, e.g. "America/New_York"; null: the computer's. */
  timezone: string | null;
  /** Position given to navigator.geolocation; null: no position (permission refused). */
  geo: { latitude: number; longitude: number; label: string } | null;
}

export interface TextSize {
  /** Default font size factor: 1, 1.3, 1.5 or 2 (rem, em and % grow, px stay). */
  scale: number;
  /** Page zoom: 1 or 2. */
  zoom: number;
}

export type Language = 'system' | 'en' | 'fr';

/** A simulated API response: requests matching `pattern` get this answer instead of the real one. */
export interface ApiMock {
  id: string;
  enabled: boolean;
  /** "*" for any method. */
  method: string;
  /** URL with * wildcards, e.g. "*\/api/plans*". */
  pattern: string;
  status: number;
  contentType: string;
  body: string;
  delayMs: number;
}

/** User preferences the devices pretend to have (CSS media features). */
export interface MediaPrefs {
  colorScheme: 'auto' | 'light' | 'dark';
  reducedMotion: boolean;
  moreContrast: boolean;
}

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

/** Everything known about the current page: share tags, site files, the 53 checks. */
export interface AnalyzeReport {
  url: string;
  share: ShareReport;
  site: SiteFiles | null;
  checks: CheckResult[];
  score: { passed: number; total: number };
  /** Core Web Vitals of each device (by device id). */
  vitals?: Record<string, Vitals>;
  /** axe-core violations (merged across devices) and keyboard focus. */
  a11y?: { violations: AxeViolation[]; focus: { count: number; total: number; examples: string[] } | null } | null;
  structured?: StructuredData;
  hreflang?: HreflangReport | null;
  /** The project's budgets that apply to this page. */
  budgets?: BudgetResult[];
  /** A first visit without consent: trackers, cookies, banner (null when it failed). */
  privacy?: PrivacyReport | null;
}

/** One measure of a deployment (or of the page shown), kept to draw the history. */
export interface HistoryEntry {
  at: number;
  deploymentId: string | null;
  url: string;
  production: boolean;
  branch: string | null;
  commit: string | null;
  /** Device the page was rendered on. */
  device: string;
  score: { passed: number; total: number } | null;
  lcpMs: number | null;
  cls: number | null;
  bytes: number | null;
  requests: number | null;
  /** Exceeded budgets, one line each. */
  budgetFailures: string[];
  /** What triggered the measure: a Vercel deployment, a commit, a finished Claude task, or you. */
  source?: 'vercel' | 'commit' | 'claude' | 'manual';
  /** Security score, security headers present and problems (Security section's checks, without the file probe). */
  security?: { passed: number; total: number; headers: string[]; problems: string[] } | null;
  error: string | null;
}

/** A capture for the export: one device, its viewport or the whole page. */
export interface ExportShot {
  id: string;
  label: string;
  /** CSS px of what was captured. */
  width: number;
  height: number;
  /** PNG data URL. */
  dataUrl: string;
  /** The page was cut (very long pages). */
  cut?: boolean;
}

export interface ReviewState {
  running: boolean;
  /** Link to send, per project id (null: no review open). */
  links: Record<string, string | null>;
  /** The link only works on the local network. */
  localOnly: boolean;
}

/** Result of the automatic filling on one device. */
export interface FormFill {
  filled: number;
  /** Wrong data a field took without complaining (no validation). */
  accepted: string[];
  /** Fields the browser refuses, with its message. */
  refused: string[];
  error?: string;
}

export interface TabOrderInfo {
  count: number;
  /** Elements that show no visible focus. */
  missing: number;
  /** Elements with a tabindex above 0 (they jump the queue). */
  positive: number;
}

export type { SiteAudit, Budget, BudgetResult };
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

/** Kinglet's license (a Polar license key, activated on this computer). */
export interface LicenseState {
  /**
   * dev: development build, no license asked. active: checked with Polar. offline: last check
   * failed for lack of connection, still within the grace period. none: no key on this computer.
   * invalid: Polar refused the key (refunded, revoked, activation removed). expired: offline for too long.
   * unconfigured: this build doesn't know its Polar organization and benefit yet.
   */
  status: 'dev' | 'active' | 'offline' | 'none' | 'invalid' | 'expired' | 'unconfigured';
  /** The key with only its last characters visible. */
  key: string | null;
  email: string | null;
  customer: string | null;
  /** This computer's name in the key's list of activations. */
  instanceName: string | null;
  /** How many computers the key can be activated on (null: no limit). */
  activationLimit: number | null;
  /** Last successful check with Polar. */
  validatedAt: number | null;
  error: string | null;
}

/** A Security run: the report, and whether the site is one of the user's (local or a linked Vercel project). */
export type SecurityRun = SecurityReport & { ownSite: boolean };

/** Settings that belong to the project shown: each project keeps its own (see shared/projects.ts, withProjectTools). */
export type ProjectToolKey = 'media' | 'textSize' | 'region' | 'regionPerDevice' | 'throttle' | 'offline' | 'keyboard' | 'mocks' | 'landscape' | 'scrollSync';
export type ProjectTools = Partial<Pick<Settings, ProjectToolKey>>;

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

/** One environment rendered like a device, for the visual comparison. */
export interface VisualColumn {
  env: EnvId;
  label: string;
  url: string;
  image: string | null;
  vitals: Vitals | null;
  error: string | null;
}

export interface ShareStudio {
  previews: SharePreviews;
  fix: ShareFix;
}

/** Starting point of the share image editor, read from the page and the project. */
export interface OgImageDraft {
  input: OgImageInput;
  /** From the project's package.json when its folder is known, else from the HTML. */
  framework: Framework;
  folder: string | null;
  /** Folder served at the site root (public/, static/…), in the project folder. */
  targetDir: string | null;
  /** Production origin when known, else the page's origin. */
  origin: string;
  /** Path of the page the image is made for. */
  page: string;
}

export interface OgImageRender {
  dataUrl: string;
  bytes: number;
  format: 'png' | 'jpg';
}

export interface OgImageSaved {
  path: string;
  /** Path on the site, e.g. /og.png. */
  webPath: string;
  bytes: number;
  format: 'png' | 'jpg';
  /** Written in the project's static folder (served by the site). */
  inProject: boolean;
  tags: OgImageTags;
}

export type ShortcutAction = 'reload' | 'focus-url' | 'palette' | 'toggle-scroll-sync' | 'toggle-landscape' | 'settings' | 'switcher' | 'overview' | 'claude' | `tab-${number}`;

/** A call made by Claude Code through the MCP server. */
export interface McpActivity {
  at: number;
  tool: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface McpInfo {
  /** Command to register Kinglet in Claude Code. */
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
  | { type: 'favicon'; url: string; pageUrl: string }
  | { type: 'github'; state: GitHubState }
  | { type: 'linear'; state: LinearState }
  | { type: 'slack'; state: SlackState }
  | { type: 'term'; projectId: string; data?: string; exit?: number | null }
  | { type: 'inspect'; state: InspectState }
  | { type: 'audit'; done: number; queued: number; external?: boolean }
  /** Steps recorded so far (startPath null: recording stopped). */
  | { type: 'journey-recording'; startPath: string | null; steps: JourneyStep[] }
  /** A journey being played: the step each device is on. */
  | { type: 'journey-progress'; journeyId: string; steps: Record<string, number> }
  /** Last run of each journey of a project. */
  | { type: 'journey-runs'; projectId: string; runs: Record<string, JourneyRun> }
  | { type: 'taborder'; devices: Record<string, TabOrderInfo> }
  | { type: 'history'; projectId: string; entries: HistoryEntry[] }
  | { type: 'feedback'; projectId: string; pins: FeedbackPin[] }
  | { type: 'review'; state: ReviewState }
  | { type: 'dev'; projectId: string; state: DevServerState };

/** The dev server Kinglet runs in a project's folder. */
export interface DevServerState {
  status: 'installing' | 'starting' | 'running' | 'stopped' | 'error';
  /** What runs: "npm run dev"… */
  command: string;
  /** The address it answers on, once it does. */
  url: string | null;
  /** Recent output (install, then the server). */
  output: string;
  error: string | null;
}

/** A project to create from scratch: an empty folder with git, the stack is chosen with Claude. */
export interface NewProjectRequest {
  name: string;
  /** Folder that will hold the project's folder. */
  parent: string;
}

/** Publishing a project: its GitHub repository, then its Vercel project. */
export interface PublishResult {
  repo: { fullName: string; htmlUrl: string } | null;
  vercel: { projectId: string; teamId: string | null; url: string | null; deploymentUrl: string | null; inspectorUrl: string | null; deployError: string | null } | null;
}

/** One line of a diff, with its numbers in the old and new file. */
export interface DiffLine {
  kind: 'hunk' | 'add' | 'del' | 'ctx';
  text: string;
  old: number | null;
  new: number | null;
}

/** A file changed since the last commit. Status: M modified, A added, D deleted, R renamed, ? untracked. */
export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: 'M' | 'A' | 'D' | 'R' | '?';
  added: number;
  removed: number;
  binary: boolean;
  truncated: boolean;
  lines: DiffLine[];
}

/** The project folder's uncommitted changes (`error: 'git'` when git isn't installed). */
export interface WorkingChanges {
  repo: boolean;
  branch: string | null;
  files: ChangedFile[];
  error: 'git' | null;
}

/** The pull request opened from a branch, and the state of its CI. */
export interface PullRequest {
  branch: string;
  number: number;
  title: string;
  state: 'open' | 'draft' | 'merged' | 'closed';
  url: string;
  /** Check runs of the PR's last commit (null: none). */
  checks: { state: 'success' | 'failure' | 'pending'; passed: number; total: number } | null;
}

export interface GitHubState {
  connected: boolean;
  user: { login: string; name: string | null } | null;
  error: string | null;
}

/** Linear connection (personal API key), to send feedback as issues. */
export interface LinearState {
  connected: boolean;
  user: { name: string; email: string | null } | null;
  /** Teams the key can open issues in. */
  teams: import('./feedback').LinearTeam[];
  error: string | null;
}

/** Slack Incoming Webhook, to post feedback in a channel. */
export interface SlackState {
  connected: boolean;
  /** The webhook without its secret, to recognize it. */
  hint: string | null;
  error: string | null;
}

/** Accounts a new repository can go in: the user, then their organizations. */
export type GitHubOwners = string[];

/** A local dev server found on a usual port, and its folder when the process can be read. */
export interface LocalServer {
  url: string;
  port: number;
  folder: string | null;
}

/** Claude Code on this computer. */
export interface ClaudeCli {
  found: boolean;
  path: string | null;
  version: string | null;
}

/** Something joined to a message: a capture (with its pin), or text (an error, a check…). */
export type ChatAttachment = { kind: 'image'; label: string; dataUrl: string } | { kind: 'context'; label: string; text: string };

/** A review comment pinned on a device: for a client's feedback, or your own to-do list. */
export interface FeedbackPin {
  id: string;
  /** Number shown on the pin. */
  n: number;
  deviceId: string;
  deviceLabel: string;
  url: string;
  /** CSS px in the device viewport. */
  x: number;
  y: number;
  selector: string | null;
  elementText: string | null;
  comment: string;
  /** Capture with the pin (JPEG data URL). */
  image: string | null;
  createdAt: number;
  done: boolean;
  /** Who wrote it: null for you, a name for a client (review link). */
  author?: string | null;
  /** Where the pin is on its capture (0..1), when the capture has no pin drawn on it (review link). */
  fx?: number;
  fy?: number;
  /** The pinned element's box on its capture (0..1), when a whole element was pinned. */
  box?: { x: number; y: number; w: number; h: number } | null;
  /** Answers in the thread (yours and the client's). */
  replies?: { author: string | null; text: string; at: number }[];
}

/** How an element looks on one device (inspector). null: not on this device. */
export interface ElementMetrics {
  tag: string;
  text: string;
  shown: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  margin: string;
  padding: string;
  font: string;
  lineHeight: string;
  color: string;
  background: string;
  display: string;
}

/** The element hovered (or picked) in inspector mode, measured on every device. */
export interface InspectState {
  selector: string;
  picked: boolean;
  devices: Record<string, ElementMetrics | null>;
}

/** What is under a point of a device's page. */
export interface ElementInfo {
  selector: string;
  tag: string;
  text: string;
  html: string;
  /** Box in CSS px of the device viewport. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface KingletApi {
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
  /** New captures of the frozen devices (an option changed while a menu is open). */
  refreeze(): Promise<Record<string, string>>;
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
  /** The 10 platform previews (one fetch per bot) and the suggested fix. */
  sharePreviews(url: string): Promise<ShareStudio>;
  journeys: {
    record(): Promise<{ startPath: string }>;
    dropStep(index: number): void;
    /** Stops recording; with a name, saves the journey in the active project. */
    stop(name: string | null): Promise<Journey | null>;
    /** On the devices shown, on the current origin. */
    play(journeyId: string): Promise<JourneyRun>;
    runs(projectId: string): Promise<Record<string, JourneyRun>>;
    /** Writes the Playwright test (tests/ of the project, or where the user chooses); returns the path. */
    exportPlaywright(journeyId: string): Promise<string | null>;
  };
  ogImage: {
    /** Defaults from the page (title, description, theme-color, icon) and where it would be saved. */
    draft(url: string): Promise<OgImageDraft>;
    /** Rendered at 1200×630, as it will be saved. */
    render(input: OgImageInput): Promise<OgImageRender>;
    /** Saved in the project's static folder (never over an existing file), or where the user chooses. */
    save(input: OgImageInput, draft: OgImageDraft, choose?: boolean): Promise<OgImageSaved | null>;
  };
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
  /** The same page on each environment, rendered off screen like one device (PNG + Web Vitals). */
  compareVisual(targets: { env: EnvId; label: string; url: string }[], deviceId: string): Promise<VisualColumn[]>;
  claude: {
    state(): Promise<{ hooks: ClaudeHookState; projects: Record<string, ClaudeProjectState> }>;
    /** Add Kinglet's hooks to ~/.claude/settings.json (a backup is kept). */
    install(): Promise<ClaudeHookState>;
    uninstall(): Promise<ClaudeHookState>;
    /** The user looked at the result of the last task on this project. */
    markSeen(projectId: string): void;
  };
  projects: {
    /** Folder picker; also reads the folder's Vercel link (.vercel/project.json). */
    pickFolder(): Promise<{ folder: string; vercelProjectId: string | null } | null>;
    /** Asks where, then clones the repository there; null when cancelled. */
    clone(gitUrl: string): Promise<{ folder: string } | null>;
    /** Uncommitted changes in the project's folder (null without a folder). */
    changes(projectId: string): Promise<WorkingChanges | null>;
    /** Where new projects go by default (~/dev, ~/code… when one exists). */
    defaultParent(): Promise<string>;
    /** Folder picker for the place of a new project; null when cancelled. */
    pickParent(current: string | null): Promise<string | null>;
    /** Create the project's empty folder (with git) and add the project; the renderer opens it. */
    create(req: NewProjectRequest): Promise<Project>;
    /** Create the project's GitHub repository and push its folder there. */
    publishGitHub(projectId: string, opts: { name: string; owner: string | null; private: boolean }): Promise<{ fullName: string; htmlUrl: string }>;
    /** Create the project's Vercel project from its GitHub repository and start the first deployment. */
    publishVercel(projectId: string, opts: { name: string; teamId: string | null }): Promise<NonNullable<PublishResult['vercel']>>;
  };
  dev: {
    /** The dev servers Kinglet runs, per project id. */
    all(): Promise<Record<string, DevServerState>>;
    /** Whether the project's folder has a dev script to run (package.json "dev"). */
    canStart(projectId: string): Promise<boolean>;
    /** Install the dependencies if needed, then run the project's dev script. */
    start(projectId: string): Promise<DevServerState>;
    stop(projectId: string): Promise<void>;
  };
  openExternal(url: string): void;
  security: {
    /** Security of a page; `probe` also tries sensitive paths (.env, .git…), for the user's own site only. */
    run(url: string, opts?: { probe?: boolean }): Promise<SecurityRun>;
  };
  license: {
    state(): Promise<LicenseState>;
    /** Frees this computer's activation, then restarts Kinglet on the license screen. */
    deactivate(): Promise<{ ok: boolean; error: string | null }>;
  };
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
  /** Local dev servers running now (first-run screen, onboarding). */
  localServers(): Promise<LocalServer[]>;
  /** Folder on disk of a Vercel project (its .vercel/project.json), searched in the usual code folders. */
  findFolder(vercelProjectId: string): Promise<string | null>;
  /** Inspector mode: hover an element on a device, see it on all of them. */
  setInspect(on: boolean): void;
  /** The element under a point (CSS px) of a device's page. */
  elementAt(deviceId: string, x: number, y: number): Promise<ElementInfo | null>;
  /** The box of an element (by selector) on each device, CSS px of its viewport; null where it isn't. */
  rectsOf(selector: string): Promise<Record<string, ElementInfo['rect'] | null>>;
  feedback: {
    load(projectId: string): Promise<FeedbackPin[]>;
    save(projectId: string, pins: FeedbackPin[]): Promise<void>;
  };
  github: {
    state(): Promise<GitHubState>;
    /** Open an issue in a repository ("owner/name"); returns its URL. */
    createIssue(repo: string, title: string, body: string): Promise<string>;
    /** Captures pushed to the repository's kinglet-feedback branch; returns a URL per image, for an issue. */
    uploadImages(repo: string, folder: string, images: { name: string; dataUrl: string }[]): Promise<string[]>;
    /** Pull request of each branch of a repository ("owner/name"), by branch. */
    pullRequests(repo: string, branches: string[]): Promise<Record<string, PullRequest>>;
    connect(token: string): Promise<GitHubState>;
    /** Accounts a new repository can go in: the user, then their organizations. */
    owners(): Promise<GitHubOwners>;
    disconnect(): Promise<GitHubState>;
  };
  linear: {
    state(): Promise<LinearState>;
    /** Check a personal API key, then keep it encrypted. */
    connect(key: string): Promise<LinearState>;
    /** Teams again (one created since). */
    refresh(): Promise<LinearState>;
    disconnect(): Promise<LinearState>;
    /** Captures uploaded to Linear; returns a URL per image (empty when one failed), for an issue. */
    uploadImages(images: { name: string; dataUrl: string }[]): Promise<string[]>;
    /** Open an issue in a team; returns its URL. */
    createIssue(teamId: string, title: string, description: string): Promise<string>;
  };
  slack: {
    state(): Promise<SlackState>;
    /** Check the webhook by posting a short message in its channel, then keep it encrypted. */
    connect(url: string): Promise<SlackState>;
    disconnect(): Promise<SlackState>;
    /** Post a message (Block Kit) in the webhook's channel. */
    send(message: import('./feedback').SlackMessage): Promise<void>;
  };
  chat: {
    cli(): Promise<ClaudeCli>;
    /** Run `claude mcp add` (user scope) so Claude in a terminal sees Kinglet too. */
    installMcp(): Promise<{ ok: boolean; output: string }>;
  };
  /** The project's terminal running `claude` (one per project, kept while Kinglet runs). */
  term: {
    /** Starts it if needed; returns its output so far, to replay. */
    start(projectId: string, cols: number, rows: number): Promise<{ buffer: string; running: boolean }>;
    restart(projectId: string, cols: number, rows: number): Promise<{ buffer: string; running: boolean }>;
    input(projectId: string, data: string): void;
    resize(projectId: string, cols: number, rows: number): void;
    /** Puts text and captures in Claude's input, without sending. */
    paste(projectId: string, text: string, attachments: ChatAttachment[]): Promise<void>;
    /** The focus entered or left the terminal (app shortcuts step aside there). */
    focus(on: boolean): void;
  };
  /** Every page of the site, read like Google: broken links, duplicates, sitemap, hreflang, checks per page. */
  audit(url: string, opts?: { limit?: number }): Promise<SiteAudit>;
  /** Fill the forms of every device (nothing is submitted). */
  fillForms(mode: 'valid' | 'invalid' | 'clear'): Promise<Record<string, FormFill>>;
  /** Keyboard tour: numbers the elements in Tab order on every device, red where the focus doesn't show. */
  setTabOrder(on: boolean): void;
  export: {
    /** The viewport (or the whole page) of each device shown, PNG. */
    shots(full: boolean): Promise<ExportShot[]>;
    /** What each device shows right now, JPEG data URLs (video frames). */
    frames(): Promise<Record<string, string>>;
    /** Scroll every device to this ratio (0 top, 1 bottom). */
    scroll(ratio: number): void;
    /** Ask where, then save; null when cancelled. */
    save(data: Uint8Array, name: string, kind: 'png' | 'pdf' | 'webm' | 'gif'): Promise<string | null>;
    /** One PDF page per device, with the page address and the date. */
    pdf(shots: ExportShot[], title: string, name: string): Promise<string | null>;
    /** Every capture in a folder (asks which). */
    folder(shots: ExportShot[]): Promise<string | null>;
  };
  history: {
    load(projectId: string): Promise<HistoryEntry[]>;
    /** Measure a deployment (default: the page shown) off screen and add it to the history. */
    measure(projectId: string, target?: { url: string; deploymentId: string | null; production: boolean; branch: string | null; commit: string | null }): Promise<HistoryEntry>;
  };
  review: {
    state(): Promise<ReviewState>;
    /** Open a review link for the project: its pins and a capture of each device. */
    open(projectId: string): Promise<ReviewState>;
    close(projectId: string): Promise<ReviewState>;
  };
  onEvent(cb: (e: PreviewEvent) => void): () => void;
}
