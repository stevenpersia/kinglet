import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '@kinglet/core';
import type { DevServerState } from '../shared/types';

/** The package manager of a folder, from its lockfile (npm when there is none). */
export function packageManager(folder: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (existsSync(join(folder, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(folder, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(folder, 'bun.lockb')) || existsSync(join(folder, 'bun.lock'))) return 'bun';
  return 'npm';
}

/** The first local address a dev server prints ("Local: http://localhost:5173/"), without colours. */
export function localUrlIn(output: string): string | null {
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const m = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d{2,5}\/?/.exec(clean);
  return m ? m[0].replace('0.0.0.0', 'localhost').replace(/\/?$/, '/') : null;
}

const KEEP = 20_000;

interface Running {
  child: ChildProcess | null;
  state: DevServerState;
  poll: NodeJS.Timeout | null;
}

/**
 * The dev server of each project, started by Kinglet in the project folder: install the
 * dependencies when node_modules is missing, then `<pm> run dev`. Runs in the user's login shell,
 * so the node of nvm, fnm, asdf… is found as in their terminal. Stopped with Kinglet.
 */
export class DevServers {
  private runs = new Map<string, Running>();

  constructor(private emit: (projectId: string, state: DevServerState) => void) {}

  state(projectId: string): DevServerState | null {
    return this.runs.get(projectId)?.state ?? null;
  }

  all(): Record<string, DevServerState> {
    return Object.fromEntries([...this.runs].map(([id, r]) => [id, r.state]));
  }

  private update(projectId: string, patch: Partial<DevServerState>) {
    const run = this.runs.get(projectId);
    if (!run) return;
    run.state = { ...run.state, ...patch };
    this.emit(projectId, run.state);
  }

  /** Start (or keep) the project's dev server. `expected` is the origin it should answer on, when known. */
  start(projectId: string, folder: string, expected: string | null): DevServerState {
    const cur = this.runs.get(projectId);
    if (cur && cur.state.status !== 'stopped' && cur.state.status !== 'error') return cur.state;
    if (!existsSync(join(folder, 'package.json'))) throw new Error(t('No package.json in this folder: nothing to run.', 'Pas de package.json dans ce dossier : rien à lancer.'));
    const pm = packageManager(folder);
    const install = !existsSync(join(folder, 'node_modules'));
    const state: DevServerState = { status: install ? 'installing' : 'starting', command: `${pm} run dev`, url: null, output: '', error: null };
    const run: Running = { child: null, state, poll: null };
    this.runs.set(projectId, run);
    this.emit(projectId, state);
    const mine = () => this.runs.get(projectId) === run && run.state.status !== 'stopped';

    const ready = (url: string) => {
      if (!mine() || run.state.status === 'running') return;
      if (run.poll) clearInterval(run.poll);
      run.poll = null;
      this.update(projectId, { status: 'running', url });
    };
    const step = (command: string, onDone: () => void) => {
      const child = shellRun(command, folder);
      run.child = child;
      const onData = (buf: Buffer) => {
        if (!mine()) return;
        const text = buf.toString();
        this.update(projectId, { output: (run.state.output + text).slice(-KEEP) });
        const url = run.state.status === 'starting' ? localUrlIn(text) : null;
        // Printed before it really listens, sometimes: wait for an answer.
        if (url) void waitFor(url, 15_000).then((ok) => ok && ready(url));
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', (e) => mine() && this.update(projectId, { status: 'error', error: e.message }));
      child.on('exit', (code) => {
        if (!mine()) return;
        if (code) {
          if (run.poll) clearInterval(run.poll);
          run.poll = null;
          this.update(projectId, { status: 'error', error: lastLines(run.state.output) || `exit ${code}` });
        } else onDone();
      });
    };
    const dev = () => {
      this.update(projectId, { status: 'starting', output: `${run.state.output}\n$ ${pm} run dev\n` });
      // The address may never be printed (quiet tools): poll the expected origin too.
      if (expected) run.poll = setInterval(() => void answers(expected).then((ok) => ok && ready(expected)), 1500);
      step(`${pm} run dev`, () => this.update(projectId, { status: 'stopped' }));
    };
    if (install) {
      this.update(projectId, { output: `$ ${pm} install\n` });
      step(`${pm} install`, dev);
    } else dev();
    return run.state;
  }

  stop(projectId: string) {
    const run = this.runs.get(projectId);
    if (!run) return;
    if (run.poll) clearInterval(run.poll);
    run.poll = null;
    if (run.state.status === 'stopped') return;
    const alive = run.state.status !== 'error';
    this.update(projectId, { status: 'stopped' });
    if (alive && run.child) kill(run.child);
  }

  stopAll() {
    for (const id of this.runs.keys()) this.stop(id);
  }
}

/** A command in the user's login shell (Windows: cmd), in its own process group. */
function shellRun(command: string, cwd: string) {
  const win = process.platform === 'win32';
  const shell = win ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/sh';
  const env = Object.fromEntries(Object.entries({ ...process.env, ELECTRON_RUN_AS_NODE: undefined, BROWSER: 'none' }).filter((x): x is [string, string] => typeof x[1] === 'string'));
  return spawn(shell, win ? ['/d', '/s', '/c', command] : ['-lc', command], { cwd, detached: !win, env, stdio: ['ignore', 'pipe', 'pipe'] });
}

function kill(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

const answers = async (url: string) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000), redirect: 'manual' });
    return true;
  } catch {
    return false;
  }
};

async function waitFor(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await answers(url)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const lastLines = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' · ');
