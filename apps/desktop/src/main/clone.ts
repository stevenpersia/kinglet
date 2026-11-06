import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@kinglet/core';

const git = (args: string[], cwd?: string, timeout = 10 * 60_000) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) =>
    // No terminal to type a password in: fail instead of waiting forever.
    execFile('git', args, { cwd, timeout, maxBuffer: 4 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stderr: String(stderr) })) : resolve({ stdout: String(stdout), stderr: String(stderr) }),
    ),
  );

/** Folder name git would give the clone: the last part of the URL, without .git. */
export const repoName = (url: string) => url.replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).pop() || 'project';

/** Same repository, whatever the form (https or ssh, with or without .git, case). */
const sameRepo = (a: string, b: string) => {
  const norm = (u: string) => u.trim().toLowerCase().replace(/\.git$/, '').replace(/^git@([^:]+):/, 'https://$1/').replace(/^ssh:\/\/git@/, 'https://').replace(/\/+$/, '');
  return norm(a) === norm(b);
};

const authFailed = (stderr: string) => /Authentication failed|could not read Username|terminal prompts disabled|Repository not found|403|401/i.test(stderr);

/**
 * Clone a repository into parent/<name> and return the folder. A folder already holding that
 * repository is reused. For GitHub, the token connected in Kinglet is tried when git's own
 * credentials don't give access; it is passed for this command only, never written to the repository.
 */
export async function cloneRepo(url: string, parent: string, githubToken: string | null = null): Promise<string> {
  const target = join(parent, repoName(url));
  if (existsSync(target)) {
    const origin = await git(['remote', 'get-url', 'origin'], target).then((r) => r.stdout.trim(), () => '');
    if (origin && sameRepo(origin, url)) return target;
    throw new Error(t(`${target} already exists and isn’t a clone of this repository. Choose another place, or this folder with “Choose the folder…”.`, `${target} existe déjà et n’est pas un clone de ce dépôt. Choisis un autre endroit, ou ce dossier avec « Choisir le dossier… ».`));
  }
  try {
    await git(['clone', url, target], parent);
    return target;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === 'ENOENT') throw new Error(t('git isn’t installed on this computer.', 'git n’est pas installé sur cet ordinateur.'));
    const stderr = err.stderr ?? '';
    if (githubToken && /^https:\/\/github\.com\//i.test(url) && authFailed(stderr)) {
      const basic = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
      try {
        await git(['-c', `http.extraHeader=Authorization: Basic ${basic}`, 'clone', url, target], parent);
        return target;
      } catch (e2) {
        if (authFailed((e2 as { stderr?: string }).stderr ?? '')) throw new Error(t('No access to this repository, neither with your git credentials nor with the GitHub token connected in Kinglet (it needs Contents: Read on it).', 'Pas d’accès à ce dépôt, ni avec tes identifiants git, ni avec le jeton GitHub connecté dans Kinglet (il lui faut Contents : lecture dessus).'));
        throw new Error(lastLine((e2 as { stderr?: string }).stderr) ?? (e2 as Error).message);
      }
    }
    if (authFailed(stderr)) throw new Error(t('No access to this repository with your git credentials. Connect GitHub in Kinglet (Settings → GitHub), or set up git (gh auth login, SSH key), then try again.', 'Pas d’accès à ce dépôt avec tes identifiants git. Connecte GitHub dans Kinglet (Réglages → GitHub), ou configure git (gh auth login, clé SSH), puis réessaie.'));
    throw new Error(lastLine(stderr) ?? err.message);
  }
}

/**
 * Point the folder's origin at a GitHub repository and push its branch there. git's own credentials
 * first; then the token connected in Kinglet, for this command only (never written in .git/config).
 */
export async function pushToGitHub(folder: string, cloneUrl: string, githubToken: string | null): Promise<string> {
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], folder).catch(() => null))?.stdout.trim() || 'main';
  if (branch === 'HEAD') throw new Error(t('This folder has no commit yet.', 'Ce dossier n’a encore aucun commit.'));
  const origin = await git(['remote', 'get-url', 'origin'], folder).then((r) => r.stdout.trim(), () => '');
  if (!origin) await git(['remote', 'add', 'origin', cloneUrl], folder);
  else if (!sameRepo(origin, cloneUrl)) throw new Error(t(`This folder already pushes to ${origin}.`, `Ce dossier pousse déjà vers ${origin}.`));
  const viaToken = () => {
    const basic = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    return git(['-c', `http.extraHeader=Authorization: Basic ${basic}`, 'push', '-u', 'origin', branch], folder, 5 * 60_000);
  };
  try {
    // With a token, use it straight away: the user's git may not know this brand-new repository's owner.
    if (githubToken) await viaToken();
    else await git(['push', '-u', 'origin', branch], folder, 5 * 60_000);
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? '';
    if (githubToken && authFailed(stderr)) {
      try {
        await git(['push', '-u', 'origin', branch], folder, 5 * 60_000);
        return branch;
      } catch {
        throw new Error(t('Couldn’t push: the GitHub token connected in Kinglet needs Contents: Read and write on this repository.', 'Push impossible : le jeton GitHub connecté dans Kinglet doit avoir Contents : lecture et écriture sur ce dépôt.'));
      }
    }
    throw new Error(lastLine(stderr) ?? (e as Error).message);
  }
  return branch;
}

const lastLine = (s?: string) =>
  s
    ?.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop() ?? null;
