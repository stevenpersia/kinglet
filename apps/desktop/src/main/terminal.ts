import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IPty } from 'node-pty';
import type { ChatAttachment } from '../shared/types';

/** What to run in a project's terminal: Claude Code, in the project folder. */
export interface Launch {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export type TerminalEvent = { projectId: string; data?: string; exit?: number | null };

interface Term {
  pty: IPty;
  /** Recent output, replayed when the panel shows this project again. */
  buffer: string;
  running: boolean;
  cwd: string;
  /** Last output time: Claude's prompt is ready once it stops printing. */
  lastOutput: number;
  startedAt: number;
}

const KEEP = 400_000;
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/**
 * One real terminal per project, running the user's own `claude` (their login, their
 * commands, their settings). It lives in the main process, so it keeps running while
 * another project is shown; the panel replays its recent output when it comes back.
 */
export class Terminals {
  private terms = new Map<string, Term>();
  private pty: typeof import('node-pty') | null = null;

  constructor(
    private emit: (e: TerminalEvent) => void,
    private launch: (projectId: string) => Launch | null,
  ) {}

  private load() {
    // Native module: loaded on first use, so the rest of the app works if it can't be.
    this.pty ??= require('node-pty') as typeof import('node-pty');
    return this.pty;
  }

  /** Start the project's terminal if needed; returns what it printed so far. */
  start(projectId: string, cols: number, rows: number): { buffer: string; running: boolean } {
    const cur = this.terms.get(projectId);
    const l = this.launch(projectId);
    if (!l) throw new Error('No folder or no Claude Code for this project.');
    if (cur?.running && cur.cwd === l.cwd) {
      this.resize(projectId, cols, rows);
      return { buffer: cur.buffer, running: true };
    }
    // The project's folder changed: Claude starts again there.
    if (cur?.running) this.kill(projectId);
    const pty = this.load().spawn(l.file, l.args, { name: 'xterm-256color', cols: Math.max(cols, 20), rows: Math.max(rows, 5), cwd: l.cwd, env: l.env });
    const term: Term = { pty, buffer: '', running: true, cwd: l.cwd, lastOutput: Date.now(), startedAt: Date.now() };
    this.terms.set(projectId, term);
    pty.onData((data) => {
      term.buffer += data;
      // Cut at a line start, so the replay doesn't begin inside an escape sequence.
      if (term.buffer.length > KEEP * 1.25) {
        const cut = term.buffer.indexOf('\n', term.buffer.length - KEEP);
        term.buffer = term.buffer.slice(cut < 0 ? -KEEP : cut + 1);
      }
      term.lastOutput = Date.now();
      this.emit({ projectId, data });
    });
    pty.onExit(({ exitCode }) => {
      term.running = false;
      // A terminal replaced by a restart ends quietly: the new one is running.
      if (this.terms.get(projectId) === term) this.emit({ projectId, exit: exitCode });
    });
    return { buffer: '', running: true };
  }

  running(projectId: string) {
    return !!this.terms.get(projectId)?.running;
  }

  input(projectId: string, data: string) {
    const t = this.terms.get(projectId);
    if (t?.running) t.pty.write(data);
  }

  resize(projectId: string, cols: number, rows: number) {
    const t = this.terms.get(projectId);
    if (t?.running && cols > 0 && rows > 0) t.pty.resize(Math.max(cols, 20), Math.max(rows, 5));
  }

  /** Stop the project's terminal and start it again. */
  restart(projectId: string, cols: number, rows: number) {
    this.kill(projectId);
    this.terms.delete(projectId);
    return this.start(projectId, cols, rows);
  }

  /**
   * Put text (and captures, saved as image files Claude Code reads by their path) in Claude's
   * input, as a paste: nothing is sent, the user completes and presses Enter. Starts the
   * terminal if needed and waits for Claude's prompt.
   */
  async paste(projectId: string, text: string, attachments: ChatAttachment[]) {
    if (!this.running(projectId)) this.start(projectId, 100, 30);
    const t = this.terms.get(projectId)!;
    // Claude is ready once it has printed and then stayed quiet a moment.
    const end = Date.now() + 10_000;
    while (Date.now() < end && (t.lastOutput === t.startedAt || Date.now() - t.lastOutput < 700 || Date.now() - t.startedAt < 1200)) await new Promise((r) => setTimeout(r, 100));
    const parts = [text.trim()];
    const dir = join(tmpdir(), 'kinglet-captures');
    for (const a of attachments) {
      if (a.kind === 'image') {
        const m = /^data:image\/(png|jpe?g|webp);base64,(.*)$/.exec(a.dataUrl);
        if (!m) continue;
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${Date.now()}-${a.label.replace(/[^\w.-]+/g, '_').slice(0, 40)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
        writeFileSync(file, Buffer.from(m[2]!, 'base64'));
        parts.push(file);
      } else parts.push(`<${a.label}>\n${a.text}\n</${a.label}>`);
    }
    const body = parts.filter(Boolean).join('\n');
    if (body) t.pty.write(`${PASTE_START}${body}${body.endsWith('\n') ? '' : ' '}${PASTE_END}`);
  }

  kill(projectId: string) {
    const t = this.terms.get(projectId);
    if (t?.running) {
      t.running = false;
      try {
        t.pty.kill();
      } catch {
        /* already gone */
      }
    }
  }

  killAll() {
    for (const id of this.terms.keys()) this.kill(id);
  }
}
