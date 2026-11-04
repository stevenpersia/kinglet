import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { t } from '@parakeet/core';
import type { ChatAttachment, ChatItem, ChatState, ClaudeCli } from '../shared/types';

/** Where Claude Code is usually installed, besides $PATH. */
const CANDIDATES = () => [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude'), '/usr/local/bin/claude', '/usr/bin/claude', '/opt/homebrew/bin/claude'];

export function findClaude(env = process.env): string | null {
  if (env.PARAKEET_CLAUDE_BIN) return existsSync(env.PARAKEET_CLAUDE_BIN) ? env.PARAKEET_CLAUDE_BIN : null;
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const p = join(dir, 'claude');
    if (existsSync(p)) return p;
  }
  return CANDIDATES().find((p) => existsSync(p)) ?? null;
}

/** A short line for a tool call: "screenshot iphone-se", "Edit src/Header.tsx". */
export function toolLabel(name: string, input: Record<string, unknown> = {}): { name: string; detail: string } {
  const short = name.replace(/^mcp__parakeet__/, '');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const detail =
    str(input.file_path) ||
    str(input.path) ||
    str(input.command) ||
    str(input.device) ||
    str(input.url) ||
    str(input.pattern) ||
    (Array.isArray(input.ids) ? (input.ids as string[]).join(', ') : '') ||
    '';
  return { name: short, detail: detail.length > 90 ? `${detail.slice(0, 90)}…` : detail };
}

type Json = Record<string, unknown>;
/** A chat item before it gets its id (distributes Omit over the union). */
type NewItem = ChatItem extends infer I ? (I extends ChatItem ? Omit<I, 'id'> & { id?: string } : never) : never;

/**
 * Claude Code inside Parakeet: one `claude -p` per message, in the project folder, with
 * Parakeet's MCP server attached and the previous session resumed. Its stream-json output
 * becomes the chat shown in the panel. The same session can be continued in a terminal.
 */
export class ClaudeChat {
  private chats = new Map<string, ChatState>();
  private procs = new Map<string, ChildProcess>();
  private seq = 0;

  constructor(
    private emit: (state: ChatState) => void,
    private mcpServer: () => { command: string; args: string[]; env: Record<string, string> },
  ) {}

  async cli(): Promise<ClaudeCli> {
    const path = findClaude();
    if (!path) return { found: false, path: null, version: null };
    const version = await new Promise<string | null>((resolve) =>
      execFile(path, ['--version'], { timeout: 5000 }, (err, out) => resolve(err ? null : (out.trim().split(/\s+/)[0] ?? null))),
    );
    return { found: true, path, version };
  }

  state(projectId: string, sessionId: string | null = null): ChatState {
    let s = this.chats.get(projectId);
    if (!s) {
      s = { projectId, sessionId, running: false, items: [] };
      this.chats.set(projectId, s);
    }
    return s;
  }

  private push(projectId: string, item: NewItem) {
    const s = this.state(projectId);
    s.items = [...s.items, { ...item, id: item.id ?? `i${++this.seq}` } as ChatItem];
    this.emit({ ...s });
  }

  private patch(projectId: string, patch: Partial<ChatState>) {
    const s = this.state(projectId);
    Object.assign(s, patch);
    this.emit({ ...s });
  }

  clear(projectId: string) {
    this.stop(projectId);
    this.chats.set(projectId, { projectId, sessionId: null, running: false, items: [] });
    this.emit({ ...this.state(projectId) });
  }

  stop(projectId: string) {
    this.procs.get(projectId)?.kill('SIGTERM');
  }

  send(opts: { projectId: string; folder: string; sessionId: string | null; text: string; attachments: ChatAttachment[]; allowCommands: boolean; context: string }) {
    const { projectId, folder } = opts;
    const bin = findClaude();
    const s = this.state(projectId, opts.sessionId);
    if (s.running) return;
    if (!s.sessionId && opts.sessionId) s.sessionId = opts.sessionId;
    this.push(projectId, { kind: 'user', text: opts.text, attachments: opts.attachments.map((a) => ({ kind: a.kind, label: a.label, thumb: a.kind === 'image' ? a.dataUrl : undefined })) });
    if (!bin) {
      this.push(projectId, { kind: 'notice', level: 'error', text: t('Claude Code isn’t installed on this computer.', 'Claude Code n’est pas installé sur cet ordinateur.') });
      return;
    }

    const content: Json[] = [];
    for (const a of opts.attachments) {
      if (a.kind === 'image') {
        const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(a.dataUrl);
        if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      }
    }
    const extra = opts.attachments.filter((a): a is Extract<ChatAttachment, { kind: 'context' }> => a.kind === 'context').map((a) => `<${a.label}>\n${a.text}\n</${a.label}>`);
    content.push({ type: 'text', text: [opts.text, ...extra].join('\n\n') });

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--mcp-config',
      JSON.stringify({ mcpServers: { parakeet: this.mcpServer() } }),
      '--allowedTools',
      'mcp__parakeet',
      '--permission-mode',
      opts.allowCommands ? 'bypassPermissions' : 'acceptEdits',
      '--append-system-prompt',
      opts.context,
      ...(s.sessionId ? ['--resume', s.sessionId] : []),
    ];
    const proc = spawn(bin, args, { cwd: folder, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.procs.set(projectId, proc);
    this.patch(projectId, { running: true });
    proc.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`);

    let buf = '';
    let stderr = '';
    let gotResult = false;
    const tools = new Map<string, string>(); // tool_use id → chat item id
    const onLine = (line: string) => {
      let e: Json;
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof e.session_id === 'string' && e.session_id !== this.state(projectId).sessionId) this.patch(projectId, { sessionId: e.session_id });
      const message = (e.message ?? {}) as Json;
      const blocks = Array.isArray(message.content) ? (message.content as Json[]) : [];
      if (e.type === 'assistant') {
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) this.push(projectId, { kind: 'text', text: b.text });
          else if (b.type === 'tool_use') {
            const id = `t${++this.seq}`;
            tools.set(String(b.id), id);
            this.push(projectId, { id, kind: 'tool', ...toolLabel(String(b.name), (b.input ?? {}) as Json), status: 'running' });
          }
        }
      } else if (e.type === 'user') {
        for (const b of blocks) {
          if (b.type !== 'tool_result') continue;
          const id = tools.get(String(b.tool_use_id));
          const st = this.state(projectId);
          if (id) st.items = st.items.map((it) => (it.id === id && it.kind === 'tool' ? { ...it, status: b.is_error ? 'error' : 'ok' } : it));
          this.emit({ ...st });
        }
      } else if (e.type === 'result') {
        gotResult = true;
        const denials = Array.isArray(e.permission_denials) ? (e.permission_denials as Json[]) : [];
        for (const d of denials) {
          const { name, detail } = toolLabel(String(d.tool_name), (d.tool_input ?? {}) as Json);
          this.push(projectId, {
            kind: 'notice',
            level: 'warning',
            text: t(
              `Blocked: ${name} ${detail}. Allow commands in Settings → Claude Code, or continue in the terminal.`,
              `Bloqué : ${name} ${detail}. Autorise les commandes dans Réglages → Claude Code, ou continue dans le terminal.`,
            ),
          });
        }
        if (e.is_error || (typeof e.subtype === 'string' && e.subtype.startsWith('error'))) this.push(projectId, { kind: 'notice', level: 'error', text: typeof e.result === 'string' && e.result ? e.result : t('Claude stopped with an error.', 'Claude s’est arrêté sur une erreur.') });
      }
    };
    proc.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    });
    proc.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString('utf8')).slice(-2000)));
    proc.on('error', (err) => this.push(projectId, { kind: 'notice', level: 'error', text: err.message }));
    proc.on('close', (code, signal) => {
      if (buf.trim()) onLine(buf.trim());
      this.procs.delete(projectId);
      if (signal) this.push(projectId, { kind: 'notice', level: 'info', text: t('Stopped.', 'Arrêté.') });
      else if (!gotResult && code !== 0) this.push(projectId, { kind: 'notice', level: 'error', text: stderr.trim().split('\n').slice(-3).join('\n') || t(`Claude Code exited (code ${code}).`, `Claude Code s’est arrêté (code ${code}).`) });
      const st = this.state(projectId);
      st.items = st.items.map((it) => (it.kind === 'tool' && it.status === 'running' ? { ...it, status: signal ? 'error' : 'ok' } : it));
      this.patch(projectId, { running: false });
    });
  }
}
