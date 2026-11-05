import { t } from '@kinglet/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatAttachment, ChatItem, ClaudeCli } from '../../shared/types';
import { activeProject, patchProject } from '../../shared/projects';
import { api, cleanError, useStore } from '../store';
import { Icon, Kbd } from './Icons';

const EMPTY = { text: '', attachments: [] as ChatAttachment[] };

/** Minimal Markdown: paragraphs, `code`, ```blocks```, **bold**, and list lines. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/```[\w-]*\n?([\s\S]*?)```/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <pre key={i} className="m-0 overflow-x-auto rounded-md border border-line bg-bg p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre text-muted">
            {part.replace(/\n$/, '')}
          </pre>
        ) : (
          part
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, j) => (
              <p key={`${i}-${j}`} className="m-0 whitespace-pre-wrap">
                {p.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, k) =>
                  seg.startsWith('`') && seg.endsWith('`') ? (
                    <code key={k} className="rounded bg-raised px-1 font-mono text-[11.5px] text-fg">
                      {seg.slice(1, -1)}
                    </code>
                  ) : seg.startsWith('**') && seg.endsWith('**') ? (
                    <b key={k} className="font-semibold text-fg">
                      {seg.slice(2, -2)}
                    </b>
                  ) : (
                    seg
                  ),
                )}
              </p>
            ))
        ),
      )}
    </>
  );
}

function Item({ it }: { it: ChatItem }) {
  if (it.kind === 'user')
    return (
      <div className="flex flex-col items-end gap-1.5">
        {it.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {it.attachments.map((a, i) => (
              <span key={i} className="flex h-6 items-center gap-1.5 rounded-md border border-line bg-active px-1.5 text-[11px] text-muted">
                {a.thumb ? <img src={a.thumb} alt="" className="h-4 w-3 rounded-sm object-cover object-top" /> : <Icon name="page" size={11} />}
                {a.label}
              </span>
            ))}
          </div>
        )}
        <div className="max-w-[88%] rounded-[12px_12px_3px_12px] bg-raised px-3 py-2 text-[12.5px] leading-normal whitespace-pre-wrap text-fg">{it.text}</div>
      </div>
    );
  if (it.kind === 'text')
    return (
      <div className="flex flex-col gap-2 text-[12.5px] leading-[1.55] text-[#d9d9de]">
        <Rich text={it.text} />
      </div>
    );
  if (it.kind === 'tool')
    return (
      <div className="flex items-center gap-2 rounded-md border border-line-soft bg-card px-2 py-1 font-mono text-[11px] text-faint">
        <span className="font-medium text-muted">{it.name}</span>
        <span className="min-w-0 flex-1 truncate">{it.detail}</span>
        {it.status === 'running' ? (
          <Icon name="reload" size={11} className="shrink-0 animate-spin text-faint" />
        ) : it.status === 'ok' ? (
          <Icon name="check" size={11} className="shrink-0 text-ok" />
        ) : (
          <Icon name="close" size={11} className="shrink-0 text-err" />
        )}
      </div>
    );
  const color = it.level === 'error' ? 'border-[rgba(242,139,130,0.3)] text-err' : it.level === 'warning' ? 'border-[rgba(230,192,123,0.3)] text-warn' : 'border-line text-muted';
  return <div className={`rounded-md border bg-card px-2.5 py-2 text-xs leading-snug whitespace-pre-wrap ${color}`}>{it.text}</div>;
}

/** Claude Code in Kinglet: ask, show a spot on a device, watch Claude fix and verify. */
export function ClaudePanel() {
  const s = useStore();
  const project = activeProject(s.settings);
  const chat = project ? s.chats[project.id] : undefined;
  const draft = (project && s.drafts[project.id]) || EMPTY;
  const [cli, setCli] = useState<ClaudeCli | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void api().chat.cli().then(setCli);
  }, []);
  useEffect(() => {
    if (project && !chat) void api().chat.state(project.id).then((st) => useStore.setState((x) => ({ chats: { ...x.chats, [st.projectId]: st } })));
  }, [project, chat]);
  useLayoutEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [chat?.items.length, chat?.running]);
  useEffect(() => {
    input.current?.focus();
  }, [draft.attachments.length]);

  const close = () => useStore.setState({ panel: null });
  const setDraft = (d: typeof draft) => project && s.setDraft(project.id, d);

  const send = async () => {
    if (!project || !draft.text.trim() || chat?.running) return;
    setError(null);
    const { text, attachments } = draft;
    setDraft(EMPTY);
    try {
      await api().chat.send(project.id, text.trim(), attachments);
    } catch (e) {
      setError(cleanError(e));
      setDraft({ text, attachments });
    }
  };
  const terminal = () => {
    if (!project?.folder) return;
    const id = chat?.sessionId ?? project.claudeSession;
    api().copy(`cd "${project.folder}" && claude${id ? ` --resume ${id}` : ''}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const pickFolder = async () => {
    if (!project) return;
    const r = await api().projects.pickFolder();
    if (r) await s.updateSettings(patchProject(s.settings, project.id, { folder: r.folder }));
  };

  let body: React.ReactNode = null;
  if (!project) body = <p className="m-0 text-xs text-faint">{t('Open a project first.', 'Ouvre d’abord un projet.')}</p>;
  else if (cli && !cli.found)
    body = (
      <div className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-card p-3 text-xs leading-relaxed text-muted">
        <span className="font-medium text-fg">{t('Claude Code isn’t installed', 'Claude Code n’est pas installé')}</span>
        {t('Kinglet runs Claude Code on this computer, with your account. Install it, then reopen this panel:', 'Kinglet fait tourner Claude Code sur cet ordinateur, avec ton compte. Installe-le, puis rouvre ce panneau :')}
        <code className="rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[11px] text-fg">npm install -g @anthropic-ai/claude-code</code>
        <button onClick={() => api().openExternal('https://docs.claude.com/en/docs/claude-code/setup')} className="self-start text-fg underline-offset-2 hover:underline">
          {t('Installation guide →', 'Guide d’installation →')}
        </button>
      </div>
    );
  else if (!project.folder)
    body = (
      <div className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-card p-3 text-xs leading-relaxed text-muted">
        <span className="font-medium text-fg">{t('Where is the code?', 'Où est le code ?')}</span>
        {t('Claude works in the project folder. Choose it once; Kinglet remembers it.', 'Claude travaille dans le dossier du projet. Choisis-le une fois, Kinglet s’en souvient.')}
        <button onClick={() => void pickFolder()} className="h-8 self-start rounded-ui bg-fg px-3 font-semibold text-bg">
          {t('Choose the folder…', 'Choisir le dossier…')}
        </button>
      </div>
    );
  else if (!chat?.items.length)
    body = (
      <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted">
        <p className="m-0">
          {t(
            'Ask for a change or a new feature. Claude edits the code in your folder, then checks the result on the devices.',
            'Demande une retouche ou une nouvelle fonctionnalité. Claude modifie le code dans ton dossier, puis vérifie le résultat sur les appareils.',
          )}
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            t('The menu overflows on iPhone SE, fix it', 'Le menu déborde sur iPhone SE, corrige-le'),
            t('Add a contact form at the bottom of the page', 'Ajoute un formulaire de contact en bas de la page'),
            t('Fix the share previews of this page', 'Corrige les aperçus de partage de cette page'),
          ].map((x) => (
            <button key={x} onClick={() => setDraft({ ...draft, text: x })} className="rounded-md border border-line bg-card px-2.5 py-1.5 text-left text-xs text-muted hover:border-line-strong hover:text-fg">
              {x}
            </button>
          ))}
        </div>
        <p className="m-0 text-faint">
          {t('“Show” lets you click a spot on a device: Claude gets the capture and the element.', '« Montrer » te laisse cliquer un endroit d’un appareil : Claude reçoit la capture et l’élément.')}
        </p>
      </div>
    );
  else body = chat.items.map((it) => <Item key={it.id} it={it} />);

  const ready = !!project?.folder && cli?.found !== false;
  return (
    <aside aria-label="Claude" className="flex w-[400px] shrink-0 flex-col border-r border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft pr-2 pl-4">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-[#d97757] ${chat?.running ? 'claude-dot' : ''}`} />
        <span className="font-medium">Claude</span>
        {project && <span className="truncate text-xs text-faint">· {project.name}</span>}
        <span className="flex-1" />
        {ready && (
          <button onClick={terminal} title={t('Copy the command that resumes this conversation in a terminal', 'Copier la commande qui reprend cette conversation dans un terminal')} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-active hover:text-fg">
            <Icon name="terminal" size={12} />
            {copied ? t('Copied ✓', 'Copié ✓') : 'Terminal'}
          </button>
        )}
        {project && !!chat?.items.length && (
          <button onClick={() => api().chat.clear(project.id)} disabled={chat.running} aria-label={t('New conversation', 'Nouvelle conversation')} title={t('New conversation', 'Nouvelle conversation')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg disabled:opacity-40">
            <Icon name="plus" size={12} />
          </button>
        )}
        <button onClick={close} aria-label={t('Close', 'Fermer')} title={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
          <Icon name="close" size={12} />
        </button>
      </div>

      <div ref={list} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {body}
        {chat?.running && (
          <div className="flex items-center gap-2 text-xs text-faint">
            <span aria-hidden="true" className="claude-dot size-1.5 rounded-full bg-[#d97757]" />
            {t('Claude is working…', 'Claude travaille…')}
            <button onClick={() => project && api().chat.stop(project.id)} className="ml-auto rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:border-line-strong hover:text-fg">
              {t('Stop', 'Arrêter')}
            </button>
          </div>
        )}
      </div>

      {project && chat?.pending && (
        <div role="alertdialog" aria-label={t('Claude asks', 'Claude demande')} className="m-3 mt-0 flex shrink-0 flex-col gap-2 rounded-[10px] border border-[rgba(217,119,87,0.4)] bg-[rgba(217,119,87,0.07)] p-3">
          <span className="text-xs font-medium text-fg">
            {t('Claude wants to run', 'Claude veut lancer')} <span className="font-mono text-[#d97757]">{chat.pending.name}</span>
          </span>
          <pre className="m-0 max-h-32 overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted">{chat.pending.input}</pre>
          <div className="flex flex-wrap gap-1.5">
            <button autoFocus onClick={() => api().chat.approve(project.id, chat.pending!.id, true)} className="h-7 rounded-ui bg-fg px-3 text-xs font-semibold text-bg">
              {t('Allow', 'Autoriser')}
            </button>
            <button onClick={() => api().chat.approve(project.id, chat.pending!.id, false)} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong">
              {t('Refuse', 'Refuser')}
            </button>
            <button onClick={() => api().chat.approve(project.id, chat.pending!.id, true, true)} className="h-7 px-1.5 text-xs text-muted hover:text-fg">
              {t('Allow everything in this conversation', 'Tout autoriser dans cette conversation')}
            </button>
          </div>
        </div>
      )}
      {ready && (
        <div className="m-3 mt-0 flex shrink-0 flex-col rounded-[10px] border border-line-strong bg-bg focus-within:border-[#4a4a52]">
          {draft.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
              {draft.attachments.map((a, i) => (
                <span key={i} className="flex h-6 items-center gap-1.5 rounded-md border border-line bg-active pr-1 pl-1.5 text-[11px] text-muted">
                  {a.kind === 'image' ? <img src={a.dataUrl} alt="" className="h-4 w-3 rounded-sm object-cover object-top" /> : <Icon name="page" size={11} />}
                  <span className="max-w-40 truncate">{a.label}</span>
                  <button onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter((_, j) => j !== i) })} aria-label={t(`Remove ${a.label}`, `Retirer ${a.label}`)} className="flex size-4 items-center justify-center rounded text-ghost hover:text-fg">
                    <Icon name="close" size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder={t('Ask Claude for a change…', 'Demande une modification à Claude…')}
            aria-label={t('Message to Claude', 'Message à Claude')}
            className="min-h-[60px] resize-none bg-transparent px-3 py-2.5 text-[12.5px] leading-normal text-fg outline-none placeholder:text-ghost"
          />
          <div className="flex items-center gap-1.5 border-t border-line-soft px-2 py-1.5">
            <button
              onClick={() => void s.startPointing()}
              title={t('Click a spot on a device to show it to Claude', 'Clique un endroit d’un appareil pour le montrer à Claude')}
              className={`flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] ${s.pointing ? 'border-[#d97757] text-[#d97757]' : 'border-line text-muted hover:border-line-strong hover:text-fg'}`}
            >
              <Icon name="target" size={11} />
              {t('Show', 'Montrer')}
            </button>
            <span className="ml-1 text-[10.5px] text-ghost">
              <Kbd>Ctrl J</Kbd>
            </span>
            <span className="flex-1" />
            <button onClick={() => void send()} disabled={!draft.text.trim() || !!chat?.running} aria-label={t('Send', 'Envoyer')} className="flex size-7 items-center justify-center rounded-[7px] bg-fg text-bg disabled:bg-raised disabled:text-ghost">
              <Icon name="up" size={13} />
            </button>
          </div>
        </div>
      )}
      {error && <p className="m-3 mt-0 text-xs text-err">{error}</p>}
    </aside>
  );
}
