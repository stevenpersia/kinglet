import { locale, t } from '@kinglet/core';
import { useEffect, useRef, useState } from 'react';
import type { FeedbackPin } from '../../shared/types';
import { activeProject } from '../../shared/projects';
import { api, cleanError, projectVercel, useStore } from '../store';
import { Icon } from './Icons';
import { ToolPanel } from './Stage';

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

/** The open pins as Markdown: for an issue, a message, or Claude. With `images` (pin id → URL), each capture shows in it. */
export function pinsMarkdown(projectName: string, pins: FeedbackPin[], images: Record<string, string> = {}): string {
  const date = new Date().toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    t(`## Feedback on ${projectName} · ${date}`, `## Retours sur ${projectName} · ${date}`),
    '',
    ...pins.map((p) =>
      [
        `${p.n}. **${p.deviceLabel}** · \`${pathOf(p.url)}\`${p.selector ? ` · \`${p.selector}\`` : ''}${p.elementText ? ` (« ${p.elementText.slice(0, 60)} »)` : ''}`,
        `   ${p.author ? `${p.author}: ` : ''}${p.comment.trim() || t('(no comment)', '(sans commentaire)')}`,
        ...(p.replies ?? []).map((r) => `   > ${r.author ?? t('Team', 'Équipe')}: ${r.text}`),
        ...(images[p.id] ? ['', `   <img src="${images[p.id]}" width="320" alt="${t(`Pin ${p.n}`, `Épingle ${p.n}`)}">`, ''] : []),
      ].join('\n'),
    ),
  ].join('\n');
}

const check = (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 6.5l2.5 2.5 4.5-6" />
  </svg>
);

/** A chevron: down when open, right when folded. */
const chevron = (open: boolean) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? '' : '-rotate-90'}>
    <path d="M2.5 3.5L5 6l2.5-2.5" />
  </svg>
);

type Status = { ok: boolean; text: string; url?: string; note?: string; sent?: string[] };

/** Review pins: comments pinned on the devices, then sent to GitHub, as text, or to Claude. */
export function FeedbackPanel() {
  const s = useStore();
  const project = activeProject(s.settings);
  const pins = project ? (s.pins[project.id] ?? null) : null;
  const repo = projectVercel(s).project?.repo ?? null;
  const [showDone, setShowDone] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (project) void s.loadPins(project.id);
    setStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!project) return null;
  const list = pins ?? [];
  const open = list.filter((p) => !p.done);
  const done = list.filter((p) => p.done);
  const set = (next: FeedbackPin[]) => s.setPins(project.id, next);
  const patch = (id: string, p: Partial<FeedbackPin>) => set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const shots = open.filter((p) => p.image).length;

  const copy = () => {
    api().copy(pinsMarkdown(project.name, open));
    setStatus({ ok: true, text: t('Copied as Markdown ✓', 'Copié en Markdown ✓') });
  };
  const toClaude = () =>
    s.askClaude(
      t(`Handle this feedback, one numbered pin per point (captures joined):\n\n${pinsMarkdown(project.name, open)}`, `Traite ces retours, une épingle numérotée par point (captures jointes) :\n\n${pinsMarkdown(project.name, open)}`),
      open
        .filter((p) => p.image)
        .slice(0, 6)
        .map((p) => ({ kind: 'image' as const, label: t(`${p.deviceLabel} · pin ${p.n}`, `${p.deviceLabel} · épingle ${p.n}`), dataUrl: p.image! })),
    );
  const issue = async () => {
    if (!repo || sending) return;
    setStatus(null);
    setSending(true);
    try {
      // The captures first, on the repository's feedback branch: the issue shows them.
      const withImage = open.filter((p) => p.image);
      const images: Record<string, string> = {};
      let note: string | undefined;
      if (withImage.length) {
        try {
          const stamp = new Date().toISOString().slice(0, 10);
          const urls = await api().github.uploadImages(repo, `feedback/${stamp}-${Date.now().toString(36)}`, withImage.map((p) => ({ name: `pin-${p.n}.jpg`, dataUrl: p.image! })));
          withImage.forEach((p, i) => urls[i] && (images[p.id] = urls[i]!));
        } catch (e) {
          note = cleanError(e);
        }
      }
      const url = await api().github.createIssue(
        repo,
        t(`Feedback · ${open.length} point${open.length > 1 ? 's' : ''}`, `Retours · ${open.length} point${open.length > 1 ? 's' : ''}`),
        `${pinsMarkdown(project.name, open, images)}\n\n_${Object.keys(images).length ? t('Pinned in Kinglet.', 'Épinglé dans Kinglet.') : t('Pinned in Kinglet (the captures stay in the app).', 'Épinglé dans Kinglet (les captures restent dans l’app).')}_`,
      );
      setStatus({ ok: true, text: t('Issue opened ✓', 'Issue ouverte ✓'), url, note, sent: open.map((p) => p.id) });
    } catch (e) {
      setStatus({ ok: false, text: cleanError(e) });
    } finally {
      setSending(false);
    }
  };
  const markSent = (ids: string[]) => {
    set(list.map((x) => (ids.includes(x.id) ? { ...x, done: true } : x)));
    setStatus(null);
  };
  const stillOpen = status?.sent?.filter((id) => open.some((p) => p.id === id)) ?? [];

  return (
    <ToolPanel tool="feedback" subtitle={t(`${open.length} open · ${done.length} done`, `${open.length} ouvert${open.length > 1 ? 's' : ''} · ${done.length} traité${done.length > 1 ? 's' : ''}`)}>
      <div className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col gap-2.5 p-3">
          <button onClick={() => (s.pointing ? s.stopPointing() : void s.startPointing('feedback'))} className={`flex h-8 shrink-0 items-center justify-center gap-2 rounded-ui text-xs font-semibold ${s.pointing ? 'border border-[#d97757] text-[#d97757]' : 'bg-fg text-bg'}`}>
            <Icon name={s.pointing ? 'target' : 'pin'} size={12} />
            {s.pointing ? t('Pick an element on a device…', 'Choisis un élément sur un appareil…') : t('Pin a comment', 'Épingler un retour')}
          </button>
          {!open.length && (
            <p className="m-0 text-xs leading-relaxed text-muted">
              {t(
                'Pin what to change right on the devices: hover an element, click it. Each pin keeps the device, the page, the element and a capture. Then send everything to GitHub, to Claude, or as text.',
                'Épingle ce qu’il faut changer directement sur les appareils : survole un élément, clique-le. Chaque épingle garde l’appareil, la page, l’élément et une capture. Puis envoie tout sur GitHub, à Claude, ou en texte.',
              )}
            </p>
          )}
          {open.map((p) => (
            <PinCard key={p.id} pin={p} autoFocus={!p.comment && p === list[list.length - 1]} onPatch={(x) => patch(p.id, x)} onDelete={() => set(list.filter((x) => x.id !== p.id))} />
          ))}
          {done.length > 0 && (
            <div className="flex flex-col">
              <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="flex items-center gap-1.5 self-start py-1 text-xs text-faint hover:text-fg">
                {chevron(showDone)}
                {t(`Done (${done.length})`, `Traités (${done.length})`)}
              </button>
              {showDone &&
                done.map((p) => (
                  <div key={p.id} className="group flex items-center gap-2 border-t border-line-soft px-1 py-1.5 text-xs text-faint first-of-type:border-t-0">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ok text-bg">{check}</span>
                    <span className="min-w-0 flex-1 truncate line-through decoration-ghost">
                      {p.n}. {p.comment.trim() || p.elementText || pathOf(p.url)}
                    </span>
                    <button onClick={() => patch(p.id, { done: false })} className="shrink-0 text-[11px] text-ghost hover:text-fg">
                      {t('Reopen', 'Rouvrir')}
                    </button>
                    <button onClick={() => set(list.filter((x) => x.id !== p.id))} aria-label={t(`Delete pin ${p.n}`, `Supprimer l’épingle ${p.n}`)} className="shrink-0 text-[11px] text-ghost opacity-0 group-hover:opacity-100 hover:text-err focus-visible:opacity-100">
                      {t('Delete', 'Supprimer')}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        <ReviewLink projectId={project.id} />

        {(open.length > 0 || status) && (
          <div className="sticky bottom-0 flex shrink-0 flex-col gap-2.5 border-t border-line bg-[linear-gradient(180deg,#161617,#131314)] p-3">
            {open.length > 0 && (
              <>
                <div className="flex items-center gap-2.5">
                  {shots > 0 && (
                    <span className="flex shrink-0" aria-hidden="true">
                      {open
                        .filter((p) => p.image)
                        .slice(0, 3)
                        .map((p, i) => (
                          <img key={p.id} src={p.image!} alt="" className={`h-9 w-[22px] rounded-[3px] border-[1.5px] border-[#131314] object-cover object-top ${i ? '-ml-2' : ''}`} />
                        ))}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12.5px] font-semibold">{t(`Send the ${open.length} open pin${open.length > 1 ? 's' : ''}`, open.length > 1 ? `Envoyer les ${open.length} retours ouverts` : 'Envoyer le retour ouvert')}</span>
                    <span className="text-[11px] text-faint">
                      {shots
                        ? t(`Their comments and ${shots} capture${shots > 1 ? 's' : ''}`, shots > 1 ? `Leurs commentaires et leurs ${shots} captures` : 'Les commentaires et la capture')
                        : t('Their comments, device, page and element', 'Commentaires, appareil, page et élément')}
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => void issue()}
                  disabled={!repo || !s.github?.connected || sending}
                  title={!s.github?.connected ? t('Connect GitHub in Settings', 'Connecte GitHub dans les réglages') : !repo ? t('No repository linked to this project', 'Aucun dépôt relié à ce projet') : t('Captures go on the kinglet-feedback branch of the repository', 'Les captures vont sur la branche kinglet-feedback du dépôt')}
                  className="flex h-8 min-w-0 items-center justify-center gap-2 rounded-ui bg-fg px-3 text-xs font-semibold text-bg disabled:opacity-50"
                >
                  <Icon name="git" size={12} />
                  {sending ? t('Opening the issue…', 'Ouverture de l’issue…') : t('Open an issue', 'Ouvrir une issue')}
                  {repo && !sending && <span className="truncate font-mono text-[11px] font-medium opacity-60">{repo}</span>}
                </button>
                {!s.github?.connected || !repo ? (
                  <p className="m-0 -mt-1 text-[11px] text-faint">{!s.github?.connected ? t('Connect GitHub in Settings to open an issue.', 'Connecte GitHub dans les réglages pour ouvrir une issue.') : t('Link a repository to this project to open an issue.', 'Relie un dépôt à ce projet pour ouvrir une issue.')}</p>
                ) : null}
                <div className="flex gap-1.5">
                  {s.settings.claudePanel && (
                    <button onClick={toClaude} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] text-xs font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]">
                      <Icon name="spark" size={11} />
                      {t('To Claude', 'À Claude')}
                    </button>
                  )}
                  <button onClick={copy} className="flex h-8 flex-1 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active text-xs font-medium hover:border-line-strong">
                    {t('Copy as Markdown', 'Copier en Markdown')}
                  </button>
                </div>
              </>
            )}
            {status && (
              <div className="flex flex-col gap-1">
                <p className={`m-0 text-xs ${status.ok ? 'text-ok' : 'text-err'}`}>
                  {status.text}{' '}
                  {status.url && (
                    <button onClick={() => api().openExternal(status.url!)} className="underline-offset-2 hover:underline">
                      {status.url.replace(/^https:\/\/github\.com\//, '')}
                    </button>
                  )}
                </p>
                {status.note && <p className="m-0 text-[11px] leading-snug text-warn">{status.note}</p>}
                {stillOpen.length > 0 && (
                  <button onClick={() => markSent(stillOpen)} className="flex items-center gap-1.5 self-start text-[11px] text-muted hover:text-fg">
                    {check}
                    {stillOpen.length > 1 ? t(`Mark the ${stillOpen.length} as done`, `Marquer les ${stillOpen.length} comme traités`) : t('Mark it as done', 'Le marquer comme traité')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ToolPanel>
  );
}

/** One open pin: its capture, where it is, the comment and the thread. Done and the rest are on its right. */
function PinCard({ pin: p, autoFocus, onPatch, onDelete }: { pin: FeedbackPin; autoFocus: boolean; onPatch: (p: Partial<FeedbackPin>) => void; onDelete: () => void }) {
  const s = useStore();
  const [menu, setMenu] = useState(false);
  const [reply, setReply] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);
  const item = 'flex h-7 items-center rounded-[5px] px-2 text-left text-xs text-muted hover:bg-active hover:text-fg';
  return (
    <div className="group relative flex shrink-0 flex-col gap-2 rounded-[10px] border border-line-strong bg-card p-2.5 hover:border-[#45454c]">
      <div className="flex items-start gap-2.5">
        {p.image && (
          <span className="relative h-20 w-12 shrink-0 overflow-hidden rounded border border-line">
            <img src={p.image} alt="" className="size-full object-cover object-top" />
            {p.fx != null && p.fy != null && <span aria-hidden="true" className="absolute size-2 -translate-1/2 rounded-full bg-[#d97757] ring-2 ring-[#d97757]/30" style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }} />}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#d97757] text-[9px] font-semibold text-white">{p.n}</span>
            <span className="truncate">{p.deviceLabel}</span>
          </span>
          <span className="truncate font-mono text-[10.5px] text-faint">{pathOf(p.url)}</span>
          {(p.selector || p.elementText) && (
            <span title={p.selector ?? undefined} className="flex max-w-full items-center gap-1.5 self-start overflow-hidden rounded border border-[rgba(217,119,87,0.22)] bg-[rgba(217,119,87,0.08)] px-1.5 text-[11px] whitespace-nowrap text-muted">
              {p.selector && <code className="shrink-0 font-mono text-[10.5px] text-[#f0a07f]">{p.selector.split(' > ').pop()}</code>}
              {p.elementText && <span className="truncate">« {p.elementText} »</span>}
            </span>
          )}
          {p.author && <span className="truncate text-[11px] text-local">{t(`from ${p.author}`, `de ${p.author}`)}</span>}
        </div>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => onPatch({ done: true })}
            aria-label={t(`Mark pin ${p.n} as done`, `Marquer l’épingle ${p.n} comme traitée`)}
            title={t('Mark as done', 'Marquer comme traité')}
            className="m-0.5 flex size-5 items-center justify-center rounded-full border-[1.5px] border-line-strong text-transparent hover:border-ok hover:bg-[rgba(125,211,168,0.08)] hover:text-ok focus-visible:border-ok focus-visible:text-ok"
          >
            {check}
          </button>
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenu(!menu)}
              aria-label={t(`More for pin ${p.n}`, `Plus pour l’épingle ${p.n}`)}
              aria-expanded={menu}
              className={`flex size-6 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg focus-visible:opacity-100 ${menu ? 'bg-active text-fg opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <circle cx="2.5" cy="6" r="1.1" />
                <circle cx="6" cy="6" r="1.1" />
                <circle cx="9.5" cy="6" r="1.1" />
              </svg>
            </button>
            {menu && (
              <div role="menu" className="absolute top-7 right-0 z-10 flex w-44 flex-col rounded-lg border border-line-strong bg-raised p-1 shadow-xl shadow-black/50">
                {p.url && p.url !== s.url && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      void s.navigate(p.url);
                    }}
                    className={item}
                  >
                    {t('Open its page', 'Ouvrir sa page')}
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    api().copy(`${p.deviceLabel} · ${pathOf(p.url)}${p.selector ? ` · ${p.selector}` : ''}\n${p.comment.trim()}`);
                  }}
                  className={item}
                >
                  {t('Copy this comment', 'Copier ce retour')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                  className={`${item} !text-err hover:!bg-[rgba(242,139,130,0.1)]`}
                >
                  {t('Delete the pin', 'Supprimer l’épingle')}
                </button>
              </div>
            )}
          </div>
        </span>
      </div>
      <textarea
        autoFocus={autoFocus}
        value={p.comment}
        onChange={(e) => onPatch({ comment: e.target.value })}
        placeholder={t('What should change here?', 'Qu’est-ce qui doit changer ici ?')}
        aria-label={t(`Comment of pin ${p.n}`, `Commentaire de l’épingle ${p.n}`)}
        rows={2}
        className="resize-none rounded-md border border-line bg-bg px-2 py-1.5 text-xs text-fg outline-none placeholder:text-ghost focus:border-line-strong"
      />
      {(p.replies ?? []).map((r, i) => (
        <div key={i} className="border-l-2 border-line pl-2 text-xs">
          <span className="text-[10.5px] font-medium text-faint">{r.author ?? t('You', 'Toi')}</span>
          <p className="m-0 whitespace-pre-wrap text-muted">{r.text}</p>
        </div>
      ))}
      {(p.author || p.replies?.length) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = reply.trim();
            if (!text) return;
            onPatch({ replies: [...(p.replies ?? []), { author: null, text, at: Date.now() }] });
            setReply('');
          }}
          className="flex gap-1.5"
        >
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('Reply…', 'Répondre…')} aria-label={t(`Reply to pin ${p.n}`, `Répondre à l’épingle ${p.n}`)} className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-xs text-fg outline-none placeholder:text-ghost focus:border-line-strong" />
          <button type="submit" className="h-7 rounded-md border border-line px-2 text-[11px] text-muted hover:border-line-strong hover:text-fg">
            {t('Send', 'Envoyer')}
          </button>
        </form>
      )}
      <span className="text-[10px] text-ghost">{new Date(p.createdAt).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  );
}

/** A link for a client: they see the pins, answer them and pin new comments from a browser. */
function ReviewLink({ projectId }: { projectId: string }) {
  const s = useStore();
  const link = s.review?.links[projectId] ?? null;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const openLink = async () => {
    setBusy(true);
    setError(null);
    try {
      useStore.setState({ review: await api().review.open(projectId) });
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!unfolded)
    return (
      <button onClick={() => setUnfolded(true)} aria-expanded={false} className="flex shrink-0 items-center gap-2 border-t border-line-soft px-3 py-2.5 text-left text-xs text-muted hover:text-fg">
        <Icon name="link" size={12} />
        <span className="flex-1">{t('Link for a client', 'Lien pour un client')}</span>
        {link && <span className="rounded bg-[rgba(125,211,168,0.12)] px-1.5 text-[10.5px] text-ok">{t('active', 'actif')}</span>}
        {chevron(false)}
      </button>
    );
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-line-soft p-3">
      <span className="flex items-center justify-between">
        <button onClick={() => setUnfolded(false)} aria-expanded className="flex items-center gap-1.5 text-xs text-muted hover:text-fg">
          {chevron(true)}
          {t('Link for a client', 'Lien pour un client')}
        </button>
        {link && (
          <button onClick={() => void api().review.close(projectId).then((st) => useStore.setState({ review: st }))} className="text-[11px] text-faint hover:text-err">
            {t('Close the link', 'Fermer le lien')}
          </button>
        )}
      </span>
      {link ? (
        <>
          <div className="flex gap-1.5">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t('Review link', 'Lien de relecture')} className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 font-mono text-[11px] text-fg outline-none" />
            <button
              onClick={() => {
                api().copy(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="h-7 shrink-0 rounded-md bg-fg px-2.5 text-[11px] font-semibold text-bg"
            >
              {copied ? t('Copied ✓', 'Copié ✓') : t('Copy', 'Copier')}
            </button>
          </div>
          <button onClick={() => void openLink()} disabled={busy} className="self-start text-[11px] text-muted hover:text-fg disabled:opacity-50">
            {busy ? t('Capturing…', 'Capture…') : t('Update the captures', 'Mettre à jour les captures')}
          </button>
        </>
      ) : (
        <button onClick={() => void openLink()} disabled={busy} className="flex h-8 items-center justify-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active text-xs font-medium hover:border-line-strong disabled:opacity-50">
          <Icon name="link" size={11} />
          {busy ? t('Capturing the devices…', 'Capture des appareils…') : t('Create a link for a client', 'Créer un lien pour un client')}
        </button>
      )}
      <p className="m-0 text-[11px] leading-snug text-faint">
        {s.review?.localOnly !== false
          ? t('The client opens it in a browser, without the app. It works on your local network; for a client elsewhere, put a tunnel in front of it (e.g. cloudflared tunnel --url http://localhost:47900) and its address below.', 'Le client l’ouvre dans un navigateur, sans l’app. Il marche sur ton réseau local ; pour un client ailleurs, mets un tunnel devant (ex. cloudflared tunnel --url http://localhost:47900) et son adresse ci-dessous.')
          : t('The link goes through your tunnel: it works anywhere while Kinglet runs.', 'Le lien passe par ton tunnel : il marche partout tant que Kinglet tourne.')}
      </p>
      {editing || s.settings.reviewPublicUrl ? (
        <input
          defaultValue={s.settings.reviewPublicUrl ?? ''}
          placeholder="https://xxx.trycloudflare.com"
          aria-label={t('Public address (tunnel)', 'Adresse publique (tunnel)')}
          onBlur={(e) => {
            const v = e.target.value.trim();
            void s.updateSettings({ reviewPublicUrl: /^https?:\/\//.test(v) ? v : null });
          }}
          className="h-7 rounded-md border border-line bg-bg px-2 font-mono text-[11px] text-fg outline-none placeholder:text-ghost focus:border-line-strong"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="self-start text-[11px] text-faint hover:text-fg">
          {t('Use a public address (tunnel)…', 'Utiliser une adresse publique (tunnel)…')}
        </button>
      )}
      {error && <p className="m-0 text-xs text-err">{error}</p>}
    </div>
  );
}
