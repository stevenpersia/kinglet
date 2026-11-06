import { readStructuredData, t, type PlatformFamily, type RichPreview, type ShareCard } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { ShareStudio } from '../../shared/types';
import { api, cleanError, useStore } from '../store';
import { Dot, Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';
import { OgImageEditorHost, openOgImageEditor } from './OgImageEditor';

/* ---------------- platform renderings (approximate, for comparison) ---------------- */

function Img({ src, className = '', style }: { src: string; className?: string; style?: React.CSSProperties }) {
  return <img src={src} alt="" className={`block object-cover ${className}`} style={style} />;
}

function Stars({ value, best }: { value: number; best: number }) {
  const n = Math.round((value / best) * 5 * 2) / 2;
  return (
    <span aria-label={`${value}/${best}`} className="text-[#E7711B]">
      {'★'.repeat(Math.floor(n))}
      {n % 1 ? '⯪' : ''}
      <span className="text-[#DADCE0]">{'★'.repeat(5 - Math.ceil(n))}</span>
    </span>
  );
}

/** A card as the platform draws it. Long words (a URL as the title) wrap instead of leaving the card. */
function Preview(props: { c: ShareCard; rich?: RichPreview | null }) {
  return <div className="min-w-0 [overflow-wrap:anywhere]">{PreviewBody(props)}</div>;
}

function PreviewBody({ c, rich }: { c: ShareCard; rich?: RichPreview | null }) {
  const title = c.title ?? c.url;
  switch (c.platform) {
    case 'telegram':
      return (
        <div className="rounded-lg bg-[#0E1621] p-2.5">
          <div className="ml-6 rounded-xl rounded-br-sm bg-[#2B5278] p-2 text-[#F5F5F5]">
            <div className="truncate pb-1.5 text-[12.5px] text-[#7DC3FF]">{c.url}</div>
            <div className="flex gap-2 border-l-2 border-[#7DC3FF] pl-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs font-semibold text-[#7DC3FF]">{c.siteName}</span>
                <span className="line-clamp-2 text-xs font-semibold">{title}</span>
                {c.description && <span className="line-clamp-3 text-[11.5px] text-[#D0DCE8]">{c.description}</span>}
                {c.image && c.layout === 'large' && <Img src={c.image} className="mt-1 w-full rounded-md" />}
              </div>
              {c.image && c.layout === 'small' && <Img src={c.image} className="size-14 shrink-0 rounded-md" />}
            </div>
          </div>
        </div>
      );
    case 'facebook':
      return (
        <div className="overflow-hidden rounded-lg border border-[#3E4042] bg-[#242526] text-[#E4E6EB]">
          <div className={c.layout === 'small' ? 'flex' : ''}>
            {c.image && <Img src={c.image} className={c.layout === 'large' ? 'aspect-[1.91] w-full' : 'size-24 shrink-0'} />}
            <div className="flex min-w-0 flex-col gap-0.5 bg-[#3A3B3C] px-3 py-2.5">
              <span className="truncate text-[11px] tracking-wide text-[#B0B3B8] uppercase">{c.domain}</span>
              <span className="line-clamp-2 text-[13px] font-semibold">{title}</span>
              {c.description && <span className="truncate text-xs text-[#B0B3B8]">{c.description}</span>}
            </div>
          </div>
        </div>
      );
    case 'bluesky':
      return (
        <div className="overflow-hidden rounded-xl border border-[#2E4052] bg-[#161E27] text-[#F1F3F5]">
          {c.image && <Img src={c.image} className="aspect-[1.91] w-full" />}
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="line-clamp-2 text-[13px] font-semibold">{title}</span>
            {c.description && <span className="line-clamp-2 text-xs text-[#AEBBC9]">{c.description}</span>}
            <span className="mt-1 border-t border-[#2E4052] pt-1.5 text-[11px] text-[#788EA5]">🌐 {c.domain}</span>
          </div>
        </div>
      );
    case 'whatsapp':
      return (
        <div className="rounded-lg bg-[#0B141A] p-2.5">
          <div className="ml-6 rounded-lg rounded-br-sm bg-[#144D37] p-[3px] text-[#E9EDEF]">
            <div className={`overflow-hidden rounded-md bg-[#0F3A2A] ${c.layout === 'small' ? 'flex' : ''}`}>
              {c.image && <Img src={c.image} className={c.layout === 'large' ? 'aspect-[1.91] w-full' : 'size-16 shrink-0'} />}
              <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                <span className="line-clamp-2 text-xs font-semibold">{title}</span>
                {c.description && <span className="truncate text-[11px] text-[#B9CBC3]">{c.description}</span>}
                <span className="text-[10.5px] text-[#8FB0A3]">{c.domain}</span>
              </div>
            </div>
            <div className="truncate px-1.5 pt-1.5 pb-0.5 text-[11.5px] text-[#53BDEB]">{c.url}</div>
          </div>
        </div>
      );
    case 'imessage':
      return (
        <div className="flex justify-end rounded-lg bg-white p-2.5">
          <div className={`w-[85%] overflow-hidden rounded-2xl bg-[#E9E9EB] text-[#111] ${c.layout === 'large' ? '' : 'flex items-center gap-2 p-2'}`}>
            {c.layout === 'large' && c.image ? <Img src={c.image} className="aspect-[1.91] w-full" /> : c.icon && <Img src={c.icon} className="size-10 shrink-0 rounded-md" />}
            <div className={c.layout === 'large' ? 'min-w-0 px-3 py-2' : 'min-w-0'}>
              <div className="line-clamp-2 text-xs font-semibold">{title}</div>
              <div className="text-[11px] text-[#6B6B70]">{c.domain}</div>
            </div>
          </div>
        </div>
      );
    case 'slack':
      return (
        <div className="rounded-lg bg-[#1A1D21] p-2.5 text-[#D1D2D3]">
          <div className="flex flex-col gap-1 border-l-[3px] border-[#4A4D52] pl-2.5">
            <span className="text-[11px] font-semibold">{c.siteName}</span>
            <span className="line-clamp-2 text-[13px] font-semibold text-[#1D9BD1]">{title}</span>
            {c.description && <span className="line-clamp-3 text-xs">{c.description}</span>}
            {c.image && <Img src={c.image} className="mt-1 max-h-28 w-auto max-w-[220px] rounded" />}
          </div>
        </div>
      );
    case 'discord':
      return (
        <div className="rounded-lg bg-[#313338] p-2.5 text-[#DBDEE1]">
          <div className="flex flex-col gap-1 rounded bg-[#2B2D31] p-2.5" style={{ borderLeft: `4px solid ${c.accent ?? '#1E1F22'}` }}>
            <span className="text-[11px] text-[#B5BAC1]">{c.siteName}</span>
            <span className="line-clamp-2 text-[13px] font-semibold text-[#00A8FC]">{title}</span>
            {c.description && <span className="line-clamp-3 text-xs">{c.description}</span>}
            {c.image && <Img src={c.image} className="mt-1 w-full rounded" />}
          </div>
        </div>
      );
    case 'linkedin':
      return (
        <div className="rounded-lg bg-[#F4F2EE] p-2.5">
          <div className={`overflow-hidden rounded-md border border-[#E0DFDC] bg-white text-[#111] ${c.layout === 'small' ? 'flex' : ''}`}>
            {c.image && <Img src={c.image} className={c.layout === 'large' ? 'aspect-[1.91] w-full' : 'size-16 shrink-0'} />}
            <div className="min-w-0 px-3 py-2">
              <div className="line-clamp-2 text-xs font-semibold">{title}</div>
              <div className="text-[11px] text-[#666]">{c.domain}</div>
            </div>
          </div>
        </div>
      );
    case 'x':
      return (
        <div className="rounded-lg border border-line-soft bg-black p-2.5 text-[#E7E9EA]">
          {c.layout === 'large' && c.image ? (
            <div className="relative overflow-hidden rounded-xl border border-[#2F3336]">
              <Img src={c.image} className="aspect-[1.91] w-full" />
              <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 text-[11px] text-white">{c.domain}</span>
            </div>
          ) : (
            <div className="flex overflow-hidden rounded-xl border border-[#2F3336]">
              {c.image ? <Img src={c.image} className="size-20 shrink-0" /> : <div className="flex size-20 shrink-0 items-center justify-center bg-[#16181C]"><Icon name="link" className="text-[#71767B]" /></div>}
              <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3">
                <span className="text-[11px] text-[#71767B]">{c.domain}</span>
                <span className="line-clamp-2 text-xs">{title}</span>
              </div>
            </div>
          )}
        </div>
      );
    case 'google':
      return (
        <div className="flex gap-3 rounded-lg bg-white p-3 text-[#202124]">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-[#F1F3F4]">{c.icon && <Img src={c.icon} className="size-4" />}</span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-xs">{c.siteName}</span>
                <span className="truncate text-[11px] text-[#4D5156]">{rich?.breadcrumb?.length ? `${c.domain} › ${rich.breadcrumb.join(' › ')}` : c.url}</span>
              </div>
            </div>
            <span className="line-clamp-2 text-[15px] text-[#1A0DAB]">{title}</span>
            {(rich?.rating || rich?.price) && (
              <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-[#70757A]">
                {rich.rating && (
                  <>
                    <span>{rich.rating.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                    <Stars value={rich.rating.value} best={rich.rating.best} />
                    {rich.rating.count != null && <span>({rich.rating.count})</span>}
                  </>
                )}
                {rich.price && <span>· {rich.price}</span>}
                {rich.availability && <span>· {rich.availability}</span>}
              </span>
            )}
            {c.description && (
              <span className="text-[11.5px] leading-snug text-[#4D5156]">
                {rich?.date && <span className="text-[#70757A]">{rich.date} — </span>}
                {c.description}
              </span>
            )}
            {rich?.extra && <span className="text-[11px] text-[#70757A]">{rich.extra}</span>}
            {rich?.faq.length ? (
              <div className="mt-1 flex flex-col border-t border-[#EBEBEB]">
                {rich.faq.map((f) => (
                  <span key={f.q} className="flex items-center justify-between border-b border-[#EBEBEB] py-1.5 text-xs">
                    {f.q}
                    <span className="text-[#70757A]">⌄</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {rich?.image && <Img src={rich.image} className="size-[72px] shrink-0 rounded-lg" />}
        </div>
      );
  }
}

const statusStyle = () =>
  ({
    ok: { dot: 'bg-ok', text: 'OK', color: 'text-muted' },
    warning: { dot: 'bg-warn', text: t('Needs work', 'À améliorer'), color: 'text-warn' },
    error: { dot: 'bg-err', text: t('Problem', 'Problème'), color: 'text-err' },
  }) as const;

/* ---------------- fix panel ---------------- */

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="m-0 rounded-[10px] border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-muted">
      {code.split('\n').map((line, i) => {
        const added = line.includes('← ajouté') || line.includes('← added');
        return (
          <span key={i} className={`block ${added ? 'bg-ok/10 text-ok' : ''}`}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}

function FixDetails({ studio }: { studio: ShareStudio }) {
  const { fix, previews } = studio;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (what: string, text: string) => {
    api().copy(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const meta = previews.meta;
  const rows: [string, string | undefined][] = [
    ['og:title', meta.og['title']],
    ['og:description', meta.og['description']],
    ['og:site_name', meta.og['site_name']],
    ['og:image', meta.og['image']],
    ['twitter:card', meta.twitter['card']],
    ['theme-color', meta.themeColor ?? undefined],
  ];

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="label">{t('Tags read', 'Balises lues')}</span>
        <span className="font-mono text-[11px] text-faint">{t(`${fix.frameworkLabel} detected`, `${fix.frameworkLabel} détecté`)}</span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2.5 border-t border-line-soft px-3 py-1.5 first:border-t-0">
            <Dot className={v ? 'bg-ok' : 'bg-warn'} />
            <span className="w-28 shrink-0 font-mono text-[11.5px] text-faint">{k}</span>
            <span className={`min-w-0 truncate text-xs ${v ? 'text-fg' : 'text-warn'}`}>{v ?? t('missing', 'absent')}</span>
          </div>
        ))}
      </div>

      <button onClick={openOgImageEditor} className="flex h-8 items-center justify-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong">
        <Icon name="page" size={13} />
        {meta.og['image'] ? t('Make a new share image…', 'Générer une nouvelle image de partage…') : t('Make the share image…', 'Générer l’image de partage…')}
      </button>

      {fix.changes.length === 0 ? (
        <p className="m-0 text-muted">{t('Nothing to fix: all share tags are in place.', 'Rien à corriger : toutes les balises de partage sont en place.')}</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="label">{t('Fix', 'Correctif')}</span>
            <span className="truncate pl-3 font-mono text-[11px] text-faint">{fix.file}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {fix.changes.map((c) => (
              <li key={c} className="flex gap-2 text-xs text-muted">
                <span className="text-ok">+</span>
                {c}
              </li>
            ))}
          </ul>
          <CodeBlock code={fix.code} />
          <div className="flex gap-1.5">
            <button onClick={() => copy('prompt', fix.prompt)} className="flex h-8 flex-1 items-center justify-center gap-2 rounded-ui bg-fg font-semibold text-bg">
              {copied === 'prompt' ? t('Prompt copied ✓', 'Prompt copié ✓') : t('Copy the prompt for Claude', 'Copier le prompt pour Claude')}
            </button>
            <button onClick={() => copy('code', fix.code)} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong">
              {copied === 'code' ? t('Copied ✓', 'Copié ✓') : 'Code'}
            </button>
          </div>
          <CopyButton text={SLASH.share} label={t(`Copy ${SLASH.share}`, `Copier ${SLASH.share}`)} done={t('Command copied: paste it into Claude Code ✓', 'Commande copiée : colle-la dans Claude Code ✓')} className="text-xs" />
        </>
      )}
      <p className="m-0 text-xs leading-relaxed text-faint">
        {t('WhatsApp and LinkedIn cache the old preview for several days. To test a fix, add', 'WhatsApp et LinkedIn gardent l’ancien aperçu en cache plusieurs jours. Pour tester une correction, ajoute')}{' '}
        <span className="font-mono text-fg">?v=2</span> {t('to the shared link.', 'au lien partagé.')}
      </p>
    </>
  );
}

/* ---------------- page: every preview at a glance ---------------- */

const FAMILIES = (): { id: PlatformFamily; label: string }[] => [
  { id: 'messagerie', label: t('Messaging', 'Messagerie') },
  { id: 'reseau', label: t('Social', 'Réseau') },
  { id: 'recherche', label: t('Search', 'Recherche') },
];

const RANK = { error: 0, warning: 1, ok: 2 } as const;

function StatusPill({ status }: { status: ShareCard['status'] }) {
  const st = statusStyle()[status];
  const tone = status === 'error' ? 'border-err/30 bg-err/10 text-err' : status === 'warning' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-ok/25 bg-ok/10 text-ok';
  return (
    <span className={`flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium ${tone}`}>
      <Dot className={st.dot} />
      {st.text}
    </span>
  );
}

function CardHead({ c }: { c: ShareCard }) {
  const family = FAMILIES().find((f) => f.id === c.family)?.label;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-fg">{c.label}</span>
        <span className="truncate font-mono text-[10.5px] text-ghost">
          {family} · {c.httpStatus ? `HTTP ${c.httpStatus}` : t('unreachable', 'injoignable')}
        </span>
      </div>
      <span className="flex-1" />
      <StatusPill status={c.status} />
    </div>
  );
}

function Problems({ c }: { c: ShareCard }) {
  if (!c.problems.length)
    return (
      <p className="m-0 flex items-center gap-2 text-xs text-faint">
        <Icon name="check" size={13} className="text-ok" />
        {t('Nothing to fix.', 'Rien à corriger.')}
      </p>
    );
  const dot = statusStyle()[c.status].dot;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {c.problems.map((pr) => (
        <li key={pr} className="flex gap-2 text-xs leading-snug text-muted">
          <Dot className={`mt-[5px] ${dot}`} />
          {pr}
        </li>
      ))}
    </ul>
  );
}

/** A grid of cards, problems first: the preview as each platform draws it, its problems underneath. */
function GridView({ cards, rich }: { cards: ShareCard[]; rich: RichPreview | null }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] items-start gap-4">
      {cards.map((c) => (
        <article key={c.platform} aria-label={c.label} className={`flex flex-col gap-3 rounded-xl border bg-card p-3.5 ${c.status === 'error' ? 'border-err/30' : c.status === 'warning' ? 'border-warn/25' : 'border-line'}`}>
          <CardHead c={c} />
          <div className="pointer-events-none">
            <Preview c={c} rich={rich} />
          </div>
          {c.status !== 'ok' && (
            <div className="border-t border-line-soft pt-3">
              <Problems c={c} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Group({ title, tone, count, action, children }: { title: string; tone: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <Dot className={tone} />
        <h2 className="m-0 text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
        <span className="font-mono text-[11px] text-ghost">{count}</span>
        <span className="h-px flex-1 bg-line-soft" />
        {action}
      </div>
      {children}
    </section>
  );
}

const cache = new Map<string, ShareStudio>();

export function SharePage() {
  const url = useStore((s) => s.url);
  const status = useStore((s) => s.status);
  const claudePanel = useStore((s) => s.settings.claudePanel);
  const [studio, setStudio] = useState<ShareStudio | null>(url ? (cache.get(url) ?? null) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);

  const load = async (force = false) => {
    if (!url) return;
    if (!force && cache.has(url)) return setStudio(cache.get(url)!);
    setLoading(true);
    setError(null);
    try {
      const s = await api().sharePreviews(url);
      cache.set(url, s);
      if (useStore.getState().url === url) setStudio(s);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'loaded') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, status]);

  if (!url) return <main className="stage-bg flex flex-1 items-center justify-center text-faint">{t('Open a site to see its Open Graph previews.', 'Ouvre un site pour voir ses aperçus Open Graph.')}</main>;

  const cards = studio?.previews.cards ?? [];
  const rich = studio ? readStructuredData(studio.previews.meta.jsonLd ?? [], studio.previews.meta.jsonLdErrors ?? []).preview : null;
  const families = FAMILIES().map((f) => f.id);
  // Problems first, then what needs work; inside each, messaging → social → search.
  const sorted = [...cards].sort((a, b) => RANK[a.status] - RANK[b.status] || families.indexOf(a.family) - families.indexOf(b.family));
  const todo = sorted.filter((c) => c.status !== 'ok');
  const fine = sorted.filter((c) => c.status === 'ok');
  const counts = { error: cards.filter((c) => c.status === 'error').length, warning: cards.filter((c) => c.status === 'warning').length, ok: fine.length };
  const fix = studio?.fix;
  const u = new URL(url);

  return (
    <main className="stage-bg flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line-soft bg-chrome/90 px-6 py-3.5 backdrop-blur">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 text-[17px] font-semibold tracking-[-0.015em]">Open Graph</h1>
          <span className="truncate font-mono text-[11px] text-faint" title={url}>
            {u.host}
            {u.pathname} · og:* · twitter:*
          </span>
        </div>
        {cards.length > 0 && (
          <div className="flex items-center gap-1.5">
            {counts.error > 0 && <span className="flex h-6 items-center gap-1.5 rounded-full bg-err/10 px-2.5 text-[11.5px] font-medium text-err"><Dot className="bg-err" />{t(`${counts.error} problem${counts.error > 1 ? 's' : ''}`, `${counts.error} problème${counts.error > 1 ? 's' : ''}`)}</span>}
            {counts.warning > 0 && <span className="flex h-6 items-center gap-1.5 rounded-full bg-warn/10 px-2.5 text-[11.5px] font-medium text-warn"><Dot className="bg-warn" />{t(`${counts.warning} to improve`, `${counts.warning} à améliorer`)}</span>}
            <span className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium ${counts.ok ? 'bg-ok/10 text-ok' : 'bg-active text-faint'}`}><Dot className={counts.ok ? 'bg-ok' : 'bg-ghost'} />{counts.ok} OK</span>
          </div>
        )}
        <span className="flex-1" />
        <button onClick={() => void load(true)} disabled={loading} className="flex h-8 shrink-0 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium hover:border-line-strong disabled:opacity-60">
          <Icon name="reload" size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? t('Reading…', 'Lecture…') : t('Re-read', 'Relire')}
        </button>
      </header>

      <div className="flex flex-col gap-8 px-6 pt-5 pb-10">
        {error ? (
          <p className="m-0 text-err">
            {t('Couldn’t read:', 'Lecture impossible :')} {error}
          </p>
        ) : !studio ? (
          <p className="m-0 py-20 text-center text-faint">{t('Reading with the 10 crawlers…', 'Lecture par les 10 robots…')}</p>
        ) : (
          <>
            {/* The tags and the fix: one place for the whole page, the cards only say what each platform sees. */}
            <div className="overflow-hidden rounded-xl border border-line bg-card">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${fix && fix.changes.length ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
                  <Icon name={fix && fix.changes.length ? 'code' : 'check'} size={15} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[13px] font-medium">
                    {fix && fix.changes.length
                      ? t(`${fix.changes.length} tag${fix.changes.length > 1 ? 's' : ''} to add`, `${fix.changes.length} balise${fix.changes.length > 1 ? 's' : ''} à ajouter`)
                      : t('All Open Graph tags are in place', 'Toutes les balises Open Graph sont en place')}
                  </span>
                  <span className="truncate font-mono text-[11px] text-faint">
                    {fix?.frameworkLabel}
                    {fix && fix.changes.length ? ` · ${fix.file}` : ''}
                  </span>
                </div>
                {fix && fix.changes.length > 0 && claudePanel && (
                  <button onClick={() => useStore.getState().askClaude(fix.prompt)} className="flex h-8 items-center gap-2 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-3 text-xs font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]">
                    <Icon name="spark" size={12} />
                    {t('Ask Claude to fix it', 'Demander à Claude de corriger')}
                  </button>
                )}
                {imageProblem(studio) && (
                  <button onClick={openOgImageEditor} className="flex h-8 items-center gap-2 rounded-ui bg-fg px-3 text-xs font-semibold text-bg">
                    <Icon name="page" size={13} />
                    {t('Make the share image', 'Générer l’image')}
                  </button>
                )}
                <button onClick={() => setFixOpen((v) => !v)} aria-expanded={fixOpen} className="flex h-8 items-center gap-1.5 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong">
                  {fix && fix.changes.length ? t('Tags & fix', 'Balises & correctif') : t('Tags read', 'Balises lues')}
                  <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true" className={fixOpen ? 'rotate-180' : ''}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {fixOpen && (
                <div className="flex max-w-[720px] flex-col gap-3 border-t border-line-soft p-4 text-xs">
                  <FixDetails studio={studio} />
                </div>
              )}
            </div>

            {todo.length > 0 && (
              <Group title={t('Needs a look', 'À revoir')} tone={counts.error ? 'bg-err' : 'bg-warn'} count={todo.length}>
                <GridView cards={todo} rich={rich} />
              </Group>
            )}
            {fine.length > 0 && (
              <Group title={t('Working', 'Fonctionnent')} tone="bg-ok" count={fine.length}>
                <GridView cards={fine} rich={rich} />
              </Group>
            )}
            <p className="m-0 text-[11.5px] text-ghost">
              {t('Read by each platform’s crawler (raw HTML, no JavaScript). Renderings are approximate.', 'Lue par le robot de chaque plateforme (HTML brut, sans JavaScript). Rendus approximatifs.')}
            </p>
          </>
        )}
      </div>
      <OgImageEditorHost />
    </main>
  );
}

/** No share image, or one that is unreachable or too small: generating one fixes it. */
function imageProblem({ previews }: ShareStudio) {
  const { meta, image } = previews;
  return !meta.ogImageUrl || !image?.ok || (image.width ?? 0) < 1200 || (image.height ?? 0) < 630 || (image.bytes ?? 0) > 300 * 1024;
}
