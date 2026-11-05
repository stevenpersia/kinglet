import { locale, t } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { FeedbackPin } from '../../shared/types';
import { activeProject } from '../../shared/projects';
import { api, cleanError, projectVercel, useStore } from '../store';
import { Icon } from './Icons';

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

/** The open pins as Markdown: for an issue, a message, or Claude. */
export function pinsMarkdown(projectName: string, pins: FeedbackPin[]): string {
  const date = new Date().toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    t(`## Feedback on ${projectName} · ${date}`, `## Retours sur ${projectName} · ${date}`),
    '',
    ...pins.map((p) =>
      [
        `${p.n}. **${p.deviceLabel}** · \`${pathOf(p.url)}\`${p.selector ? ` · \`${p.selector}\`` : ''}${p.elementText ? ` (« ${p.elementText.slice(0, 60)} »)` : ''}`,
        `   ${p.author ? `${p.author}: ` : ''}${p.comment.trim() || t('(no comment)', '(sans commentaire)')}`,
        ...(p.replies ?? []).map((r) => `   > ${r.author ?? t('Team', 'Équipe')}: ${r.text}`),
      ].join('\n'),
    ),
  ].join('\n');
}

/** Review pins: comments pinned on the devices, then sent to GitHub, as text, or to Claude. */
export function FeedbackPanel() {
  const s = useStore();
  const project = activeProject(s.settings);
  const pins = project ? (s.pins[project.id] ?? null) : null;
  const repo = projectVercel(s).project?.repo ?? null;
  const [showDone, setShowDone] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});

  useEffect(() => {
    if (project) void s.loadPins(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!project) return null;
  const list = pins ?? [];
  const open = list.filter((p) => !p.done);
  const shown = showDone ? list : open;
  const set = (next: FeedbackPin[]) => s.setPins(project.id, next);
  const patch = (id: string, p: Partial<FeedbackPin>) => set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));

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
    if (!repo) return;
    setStatus(null);
    try {
      const url = await api().github.createIssue(
        repo,
        t(`Feedback · ${open.length} point${open.length > 1 ? 's' : ''}`, `Retours · ${open.length} point${open.length > 1 ? 's' : ''}`),
        `${pinsMarkdown(project.name, open)}\n\n_${t('Pinned in Kinglet (the captures stay in the app).', 'Épinglé dans Kinglet (les captures restent dans l’app).')}_`,
      );
      setStatus({ ok: true, text: t('Issue opened ✓', 'Issue ouverte ✓'), url });
    } catch (e) {
      setStatus({ ok: false, text: cleanError(e) });
    }
  };

  return (
    <aside aria-label={t('Feedback', 'Retours')} className="flex w-[360px] shrink-0 flex-col border-r border-line-soft bg-chrome">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft pr-2 pl-4">
        <span className="label">{t('Feedback', 'Retours')}</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{t(`${open.length} open`, `${open.length} ouvert${open.length > 1 ? 's' : ''}`)}</span>
          <button onClick={() => useStore.setState({ panel: null })} aria-label={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <button onClick={() => void s.startPointing('feedback')} className={`flex h-8 shrink-0 items-center justify-center gap-2 rounded-ui text-xs font-semibold ${s.pointing ? 'border border-[#d97757] text-[#d97757]' : 'bg-fg text-bg'}`}>
          <Icon name="pin" size={12} />
          {s.pointing ? t('Click a spot on a device…', 'Clique un endroit d’un appareil…') : t('Pin a comment', 'Épingler un retour')}
        </button>
        {!shown.length && (
          <p className="m-0 text-xs leading-relaxed text-muted">
            {t(
              'Pin what to change right on the devices: each pin keeps the device, the page, the element and a capture. Then send everything to GitHub, as text, or to Claude.',
              'Épingle ce qu’il faut changer directement sur les appareils : chaque épingle garde l’appareil, la page, l’élément et une capture. Puis envoie tout sur GitHub, en texte, ou à Claude.',
            )}
          </p>
        )}
        {shown.map((p) => (
          <div key={p.id} className={`flex shrink-0 flex-col gap-2 rounded-[10px] border bg-card p-2.5 ${p.done ? 'border-line opacity-60' : 'border-line-strong'}`}>
            <div className="flex items-start gap-2.5">
              {p.image && (
                <span className="relative h-20 w-12 shrink-0 overflow-hidden rounded border border-line">
                  <img src={p.image} alt="" className="size-full object-cover object-top" />
                  {p.fx != null && p.fy != null && <span aria-hidden="true" className="absolute size-2 -translate-1/2 rounded-full bg-[#d97757] ring-2 ring-[#d97757]/30" style={{ left: `${p.fx * 100}%`, top: `${p.fy * 100}%` }} />}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded-full bg-[#d97757] text-[9px] font-semibold text-white">{p.n}</span>
                  {p.deviceLabel}
                </span>
                <span className="truncate font-mono text-[10.5px] text-faint">{pathOf(p.url)}</span>
                {p.elementText && <span className="truncate text-[11px] text-muted">« {p.elementText} »</span>}
                {p.author && <span className="truncate text-[11px] text-local">{t(`from ${p.author}`, `de ${p.author}`)}</span>}
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <label className="flex items-center gap-1 text-[10.5px] text-faint">
                  <input type="checkbox" checked={p.done} onChange={() => patch(p.id, { done: !p.done })} className="accent-[#ededef]" />
                  {t('done', 'fait')}
                </label>
                <button onClick={() => set(list.filter((x) => x.id !== p.id))} aria-label={t(`Delete pin ${p.n}`, `Supprimer l’épingle ${p.n}`)} className="flex size-5 items-center justify-center rounded text-ghost hover:text-err">
                  <Icon name="close" size={10} />
                </button>
              </span>
            </div>
            <textarea
              autoFocus={!p.comment && p === list[list.length - 1]}
              value={p.comment}
              onChange={(e) => patch(p.id, { comment: e.target.value })}
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
                  const text = (replies[p.id] ?? '').trim();
                  if (!text) return;
                  patch(p.id, { replies: [...(p.replies ?? []), { author: null, text, at: Date.now() }] });
                  setReplies({ ...replies, [p.id]: '' });
                }}
                className="flex gap-1.5"
              >
                <input value={replies[p.id] ?? ''} onChange={(e) => setReplies({ ...replies, [p.id]: e.target.value })} placeholder={t('Reply…', 'Répondre…')} aria-label={t(`Reply to pin ${p.n}`, `Répondre à l’épingle ${p.n}`)} className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-xs text-fg outline-none placeholder:text-ghost focus:border-line-strong" />
                <button type="submit" className="h-7 rounded-md border border-line px-2 text-[11px] text-muted hover:border-line-strong hover:text-fg">
                  {t('Send', 'Envoyer')}
                </button>
              </form>
            )}
            <span className="text-[10px] text-ghost">{new Date(p.createdAt).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        {list.some((p) => p.done) && (
          <button onClick={() => setShowDone(!showDone)} className="self-start text-xs text-faint hover:text-fg">
            {showDone ? t('Hide done', 'Masquer les faits') : t(`Show done (${list.length - open.length})`, `Voir les faits (${list.length - open.length})`)}
          </button>
        )}
      </div>

      <ReviewLink projectId={project.id} />
      {open.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1.5 border-t border-line-soft p-3">
          <div className="flex gap-1.5">
            {s.settings.claudePanel && (
              <button onClick={toClaude} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] text-xs font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]">
                <Icon name="spark" size={11} />
                {t('Send to Claude', 'Envoyer à Claude')}
              </button>
            )}
            <button onClick={copy} className="flex h-8 flex-1 items-center justify-center rounded-ui border border-[#2a2a2f] bg-active text-xs font-medium hover:border-line-strong">
              {t('Copy Markdown', 'Copier en Markdown')}
            </button>
          </div>
          <button
            onClick={() => void issue()}
            disabled={!repo || !s.github?.connected}
            title={!s.github?.connected ? t('Connect GitHub in Settings', 'Connecte GitHub dans les réglages') : !repo ? t('No repository linked to this project', 'Aucun dépôt relié à ce projet') : repo}
            className="flex h-8 items-center justify-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active text-xs font-medium hover:border-line-strong disabled:opacity-50"
          >
            <Icon name="git" size={11} />
            {repo ? t(`Open an issue in ${repo}`, `Ouvrir une issue dans ${repo}`) : t('Open a GitHub issue', 'Ouvrir une issue GitHub')}
          </button>
          {status && (
            <p className={`m-0 text-xs ${status.ok ? 'text-ok' : 'text-err'}`}>
              {status.text}{' '}
              {status.url && (
                <button onClick={() => api().openExternal(status.url!)} className="underline-offset-2 hover:underline">
                  {status.url.replace(/^https:\/\/github\.com\//, '')}
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </aside>
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
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-line-soft p-3">
      <span className="flex items-center justify-between">
        <span className="label">{t('Review link', 'Lien de relecture')}</span>
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
