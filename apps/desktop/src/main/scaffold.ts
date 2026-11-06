import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@kinglet/core';

/** Folder and package name: lowercase letters, digits and dashes (what npm, GitHub and Vercel all accept). */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'my-site'
  );
}

const git = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) =>
    execFile('git', args, { cwd, timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stderr: String(stderr) })) : resolve(String(stdout).trim()),
    ),
  );

/**
 * A new, empty project: parent/<slug> with a git repository on main, nothing else. The stack is
 * chosen with Claude, who writes the files.
 */
export async function createProject(opts: { name: string; parent: string }): Promise<string> {
  const folder = join(opts.parent, slugify(opts.name));
  if (existsSync(folder) && readdirSync(folder).length) throw new Error(t(`${folder} already exists and isn’t empty. Choose another name or place.`, `${folder} existe déjà et n’est pas vide. Choisis un autre nom ou un autre endroit.`));
  mkdirSync(folder, { recursive: true });
  try {
    await git(['init', '-q', '-b', 'main'], folder).catch(async () => {
      // git before 2.28 has no -b.
      await git(['init', '-q'], folder);
      await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], folder);
    });
  } catch (e) {
    // Without git the project still works locally: only publishing needs it.
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(t(`The folder is there, but git failed: ${(e as Error).message}`, `Le dossier est là, mais git a échoué : ${(e as Error).message}`));
  }
  return folder;
}

/** Vercel's framework preset for an existing folder, from its package.json (null: let Vercel detect it). */
export function frameworkOf(folder: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const known: [string, string][] = [['next', 'nextjs'], ['astro', 'astro'], ['@remix-run/react', 'remix'], ['@sveltejs/kit', 'sveltekit-1'], ['nuxt', 'nuxtjs'], ['gatsby', 'gatsby'], ['vite', 'vite']];
    return known.find(([dep]) => dep in deps)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** "owner/name" of a GitHub remote URL (https or ssh), else null. */
export function githubRepoOf(remote: string | null): string | null {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(remote?.trim() ?? '');
  return m ? `${m[1]}/${m[2]}` : null;
}
