import type { Project, ProjectToolKey, ProjectTools, Settings } from './types';

export const PROJECT_TOOL_KEYS: ProjectToolKey[] = ['media', 'textSize', 'region', 'regionPerDevice', 'throttle', 'offline', 'keyboard', 'mocks', 'landscape', 'scrollSync'];

/** Projects that are not on Vercel are identified by their local dev server. */
export const localProjectId = (origin: string) => `local:${origin}`;

const originOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

export const isLocalUrl = (u: string) => /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(u);

/** A project for a site you open by its URL (no Vercel project). */
export function projectFromUrl(url: string): Project {
  const origin = originOf(url)!;
  return {
    id: localProjectId(origin),
    name: new URL(url).host,
    vercelProjectId: null,
    teamId: null,
    localOrigin: isLocalUrl(url) ? origin : null,
    folder: null,
    lastUrl: url,
  };
}

/** Settings written before multi-project support had one site: make it the first project. */
export function migrateSettings(stored: Partial<Settings> & { url?: string | null; localOrigin?: string | null }): Partial<Settings> {
  if (stored.projects) return stored;
  const { url, localOrigin, ...rest } = stored;
  const seed = localOrigin ?? url ?? null;
  if (!seed) return { ...rest, projects: [], openIds: [], activeId: null };
  const project = { ...projectFromUrl(seed), localOrigin: localOrigin ?? (seed && isLocalUrl(seed) ? originOf(seed) : null), lastUrl: url ?? seed };
  return { ...rest, projects: [project], openIds: [project.id], activeId: project.id };
}

export const activeProject = (s: Pick<Settings, 'projects' | 'activeId'>) => s.projects.find((p) => p.id === s.activeId) ?? null;

/** Update one project. */
export function patchProject(s: Settings, id: string, patch: Partial<Project>): Pick<Settings, 'projects'> {
  return { projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Add (or reuse) a project and open it in a tab, active. */
export function openProject(s: Settings, project: Project): Pick<Settings, 'projects' | 'openIds' | 'activeId'> {
  const existing = s.projects.find((p) => p.id === project.id);
  const projects = existing ? s.projects : [...s.projects, project];
  const openIds = s.openIds.includes(project.id) ? s.openIds : [...s.openIds, project.id];
  return { projects, openIds, activeId: project.id };
}

/** Close a tab; the neighbour becomes active. The project stays known (folder, last page…). */
export function closeProject(s: Settings, id: string): Pick<Settings, 'openIds' | 'activeId'> {
  const i = s.openIds.indexOf(id);
  const openIds = s.openIds.filter((x) => x !== id);
  const activeId = s.activeId === id ? (openIds[Math.min(i, openIds.length - 1)] ?? null) : s.activeId;
  return { openIds, activeId };
}

/** The page shown changed: remember it for the active project (and in the recent list). */
export function visit(s: Settings, url: string): Pick<Settings, 'projects' | 'recentUrls'> {
  const recentUrls = [url, ...s.recentUrls.filter((u) => u !== url)].slice(0, 8);
  if (!s.activeId) return { projects: s.projects, recentUrls };
  return { ...patchProject(s, s.activeId, { lastUrl: url }), recentUrls };
}

/** Which project a Claude Code session belongs to: the one whose folder contains its cwd. */
export function projectForFolder(projects: Project[], cwd: string): Project | null {
  const norm = (p: string) => p.replace(/\/+$/, '');
  const c = norm(cwd);
  return (
    projects
      .filter((p) => p.folder && (c === norm(p.folder) || c.startsWith(`${norm(p.folder)}/`)))
      .sort((a, b) => norm(b.folder!).length - norm(a.folder!).length)[0] ?? null
  );
}

/** The tools' settings of the project shown, as they are now. */
export function toolsOf(s: Settings): ProjectTools {
  return Object.fromEntries(PROJECT_TOOL_KEYS.map((k) => [k, s[k]])) as ProjectTools;
}

/**
 * Every project keeps its own tools (emulation, network, region, keyboard, mocks, orientation,
 * scroll sync), like its devices. The top-level settings hold the active project's: switching
 * projects files them under the one we leave and brings back the next one's (the defaults for a
 * project that never changed any); changing one is filed under the active project too.
 */
export function withProjectTools(prev: Settings, patch: Partial<Settings>, defaults: ProjectTools): Partial<Settings> {
  const merged = { ...prev, ...patch };
  const switching = patch.activeId !== undefined && patch.activeId !== prev.activeId;
  let projects = merged.projects;
  if (switching) {
    if (prev.activeId) projects = projects.map((p) => (p.id === prev.activeId ? { ...p, tools: toolsOf(prev) } : p));
    const next = projects.find((p) => p.id === merged.activeId);
    const tools = { ...defaults, ...(next?.tools ?? {}) };
    return { ...patch, projects, ...tools };
  }
  const touched = PROJECT_TOOL_KEYS.some((k) => k in patch);
  if (touched && merged.activeId) {
    projects = projects.map((p) => (p.id === merged.activeId ? { ...p, tools: toolsOf(merged) } : p));
    return { ...patch, projects };
  }
  return patch;
}
