import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'Library', 'snap']);

/** Where people keep their code. */
export const defaultRoots = (home = homedir()) => ['dev', 'code', 'Code', 'projects', 'Projects', 'src', 'repos', 'workspace', 'www', 'Documents', 'Developer', 'git', 'github'].map((d) => join(home, d)).concat(home);

/** The Vercel project a folder is linked to (`vercel link` writes .vercel/project.json). */
export function vercelLinkOf(folder: string): { projectId: string; orgId: string | null } | null {
  try {
    const j = JSON.parse(readFileSync(join(folder, '.vercel', 'project.json'), 'utf8'));
    return typeof j.projectId === 'string' ? { projectId: j.projectId, orgId: typeof j.orgId === 'string' ? j.orgId : null } : null;
  } catch {
    return null;
  }
}

/**
 * Find the folder of a Vercel project on disk: the one whose .vercel/project.json names it.
 * Breadth-first under the usual code folders, skipping hidden and build folders.
 */
export function findVercelFolder(projectId: string, roots = defaultRoots(), maxDepth = 3, budget = 4000): string | null {
  const seen = new Set<string>();
  let queue = roots.filter((r) => existsSync(r)).map((r) => ({ dir: r, depth: 0 }));
  while (queue.length && budget > 0) {
    const next: typeof queue = [];
    for (const { dir, depth } of queue) {
      if (seen.has(dir) || budget-- <= 0) continue;
      seen.add(dir);
      if (vercelLinkOf(dir)?.projectId === projectId) return dir;
      if (depth >= maxDepth) continue;
      let entries: import('node:fs').Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)) next.push({ dir: join(dir, e.name), depth: depth + 1 });
    }
    queue = next;
  }
  return null;
}
