import { t, type PlatformFamily, type ShareCard } from '@parakeet/core';
import { useEffect, useState } from 'react';
import type { ShareStudio } from '../../shared/types';
import { api, cleanError, useStore } from '../store';
import { Dot, Icon, Kbd } from './Icons';
import { CopyButton, SLASH } from './Mcp';

/* ---------------- platform renderings (approximate, for comparison) ---------------- */

function Img({ src, className = '', style }: { src: string; className?: string; style?: React.CSSProperties }) {
  return <img src={src} alt="" className={`block object-cover ${className}`} style={style} />;
}

function Preview({ c }: { c: ShareCard }) {
  const title = c.title ?? c.url;
  switch (c.platform) {
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
            <div className={c.layout === 'large' ? 'px-3 py-2' : 'min-w-0'}>
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
            <span className="text-[13px] font-semibold text-[#1D9BD1]">{title}</span>
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
            <span className="text-[13px] font-semibold text-[#00A8FC]">{title}</span>
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
            <div className="px-3 py-2">
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
        <div className="flex flex-col gap-1 rounded-lg bg-white p-3 text-[#202124]">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-[#F1F3F4]">{c.icon && <Img src={c.icon} className="size-4" />}</span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-xs">{c.siteName}</span>
              <span className="truncate text-[11px] text-[#4D5156]">{c.url}</span>
            </div>
          </div>
          <span className="text-[15px] text-[#1A0DAB]">{title}</span>
          {c.description && <span className="text-[11.5px] leading-snug text-[#4D5156]">{c.description}</span>}
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

/* ---------------- scenes: each preview where people see it ---------------- */

const who = () => t('Camille', 'Camille');

function Avatar({ className = '', round = true }: { className?: string; round?: boolean }) {
  return <span aria-hidden="true" className={`block size-8 shrink-0 bg-[linear-gradient(135deg,#6b8cff,#9f7bff)] ${round ? 'rounded-full' : 'rounded-md'} ${className}`} />;
}

function Handset({ dark, children, title }: { dark: boolean; children: React.ReactNode; title: string }) {
  return (
    <div className={`flex h-[560px] w-[340px] shrink-0 flex-col overflow-hidden rounded-[40px] shadow-[0_0_0_1px_#2e2e33,0_30px_60px_rgba(0,0,0,0.65)] ${dark ? 'bg-[#0B141A]' : 'bg-white'}`}>
      <div className={`flex h-[68px] shrink-0 items-end gap-2.5 px-4 pb-2.5 text-[13px] font-medium ${dark ? 'bg-[#1F2C34] text-[#E9EDEF]' : 'justify-center border-b border-[#E5E5EA] bg-[#F7F7F7] text-[#111]'}`}>
        {dark && <Avatar className="size-7" />}
        {title}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 py-3">{children}</div>
      <div className={`flex h-12 shrink-0 items-center px-3 ${dark ? 'bg-[#1F2C34]' : 'border-t border-[#E5E5EA] bg-[#F7F7F7]'}`}>
        <span className={`h-8 flex-1 rounded-full ${dark ? 'bg-[#2A3942]' : 'border border-[#D1D1D6] bg-white'}`} />
      </div>
    </div>
  );
}

function Bubble({ dark, out, children }: { dark: boolean; out?: boolean; children: React.ReactNode }) {
  const cls = dark ? (out ? 'self-end bg-[#005C4B] text-[#E9EDEF]' : 'self-start bg-[#1F2C34] text-[#E9EDEF]') : out ? 'self-end bg-[#0B84FE] text-white' : 'self-start bg-[#E9E9EB] text-[#111]';
  return <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${cls}`}>{children}</div>;
}

function Desk({ bg, top, children, width = 600 }: { bg: string; top: React.ReactNode; children: React.ReactNode; width?: number }) {
  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-xl shadow-[0_0_0_1px_#2e2e33,0_30px_60px_rgba(0,0,0,0.65)]" style={{ background: bg, width }}>
      {top}
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </div>
  );
}

function Scene({ c }: { c: ShareCard }) {
  switch (c.platform) {
    case 'whatsapp':
      return (
        <Handset dark title={who()}>
          <Bubble dark>{t('Is the new page online?', 'Tu as mis la nouvelle page en ligne ?')}</Bubble>
          <div className="w-[88%] self-end">
            <Preview c={c} />
          </div>
          <Bubble dark>{t('Looks good on my side 👍', 'Ça marche de mon côté 👍')}</Bubble>
        </Handset>
      );
    case 'imessage':
      return (
        <Handset dark={false} title={who()}>
          <Bubble dark={false}>{t('Send me the link?', 'Tu m’envoies le lien ?')}</Bubble>
          <Preview c={c} />
          <span className="self-end pr-1 text-[10.5px] text-[#8E8E93]">{t('Delivered', 'Distribué')}</span>
        </Handset>
      );
    case 'slack':
    case 'discord': {
      const slack = c.platform === 'slack';
      return (
        <Desk
          bg={slack ? '#1A1D21' : '#313338'}
          top={<div className={`flex h-11 items-center px-4 text-[13px] font-semibold ${slack ? 'border-b border-[#2C2D30] text-[#D1D2D3]' : 'border-b border-[#26272B] text-[#F2F3F5]'}`}># {t('general', 'général')}</div>}
        >
          <div className="flex gap-3">
            <Avatar round={!slack} className="mt-0.5" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={`text-[13px] ${slack ? 'text-[#D1D2D3]' : 'text-[#F2F3F5]'}`}>
                <b className="font-semibold">{who()}</b> <span className="ml-1 text-[11px] text-[#ABABAD]">10:42</span>
              </span>
              <span className={`text-[13px] ${slack ? 'text-[#D1D2D3]' : 'text-[#DBDEE1]'}`}>
                {t('The new page is up:', 'La nouvelle page est en ligne :')} <span className={slack ? 'text-[#1D9BD1]' : 'text-[#00A8FC]'}>{c.url}</span>
              </span>
              <div className="-mx-2.5 -mb-2.5">
                <Preview c={c} />
              </div>
            </div>
          </div>
        </Desk>
      );
    }
    case 'linkedin':
      return (
        <Desk bg="#F4F2EE" width={560} top={null}>
          <div className="flex flex-col gap-3 rounded-lg border border-[#E0DFDC] bg-white p-4 text-[#111]">
            <div className="flex items-center gap-2.5">
              <Avatar className="size-10" />
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-semibold">{who()}</span>
                <span className="text-[11.5px] text-[#666]">{t('2 h · Shared publicly', '2 h · Public')}</span>
              </div>
            </div>
            <span className="text-[13px]">{t('Our new page is live, tell me what you think.', 'Notre nouvelle page est en ligne, dites-moi ce que vous en pensez.')}</span>
            <div className="-mx-2.5 -mb-2.5">
              <Preview c={c} />
            </div>
          </div>
        </Desk>
      );
    case 'x':
      return (
        <Desk bg="#000000" width={560} top={null}>
          <div className="flex gap-3 text-[#E7E9EA]">
            <Avatar className="size-10" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[14px]">
                <b className="font-semibold">{who()}</b> <span className="text-[#71767B]">@camille · 2 h</span>
              </span>
              <span className="text-[14px]">{t('New page is live 👇', 'La nouvelle page est en ligne 👇')}</span>
              <div className="-mx-2.5 -mb-2.5">
                <Preview c={c} />
              </div>
            </div>
          </div>
        </Desk>
      );
    case 'google':
      return (
        <Desk
          bg="#FFFFFF"
          width={640}
          top={
            <div className="flex h-14 items-center border-b border-[#EBEBEB] px-4">
              <span className="flex h-9 flex-1 items-center rounded-full border border-[#DFE1E5] px-4 text-[13px] text-[#202124]">{c.siteName}</span>
            </div>
          }
        >
          <div className="-m-1.5">
            <Preview c={c} />
          </div>
          {[0.75, 0.6].map((w) => (
            <div key={w} aria-hidden="true" className="flex flex-col gap-1.5 px-1.5">
              <span className="h-2.5 w-40 rounded bg-[#F1F3F4]" />
              <span className="h-3.5 rounded bg-[#E8EAED]" style={{ width: `${w * 100}%` }} />
              <span className="h-2.5 w-[90%] rounded bg-[#F1F3F4]" />
            </div>
          ))}
        </Desk>
      );
  }
}

/* ---------------- page ---------------- */

const FAMILIES = (): { id: PlatformFamily; label: string }[] => [
  { id: 'messagerie', label: t('Messaging', 'Messageries') },
  { id: 'reseau', label: t('Social', 'Réseaux') },
  { id: 'recherche', label: t('Search', 'Recherche') },
];

const cache = new Map<string, ShareStudio>();

export function SharePage() {
  const url = useStore((s) => s.url);
  const status = useStore((s) => s.status);
  const [studio, setStudio] = useState<ShareStudio | null>(url ? (cache.get(url) ?? null) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<ShareCard['platform'] | null>(null);

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

  const cards = studio?.previews.cards ?? [];
  // Families in a fixed order: the list and the arrow keys follow it.
  const ordered = FAMILIES().flatMap((f) => cards.filter((c) => c.family === f.id));
  // Default: the first platform with a problem, else the first one.
  const card = ordered.find((c) => c.platform === platform) ?? ordered.find((c) => c.status === 'error') ?? ordered.find((c) => c.status === 'warning') ?? ordered[0] ?? null;

  const onKey = (e: React.KeyboardEvent) => {
    if (!card || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const i = ordered.indexOf(card);
    const next = ordered[(i + (e.key === 'ArrowDown' ? 1 : ordered.length - 1)) % ordered.length]!;
    setPlatform(next.platform);
    document.getElementById(`share-${next.platform}`)?.focus();
  };

  if (!url) return <main className="stage-bg flex flex-1 items-center justify-center text-faint">{t('Open a site to see its share previews.', 'Ouvre un site pour voir ses aperçus de partage.')}</main>;
  const counts = { error: cards.filter((c) => c.status === 'error').length, warning: cards.filter((c) => c.status === 'warning').length };
  const st = statusStyle();

  return (
    <div className="flex min-w-0 flex-1">
      <nav aria-label={t('Platforms', 'Plateformes')} onKeyDown={onKey} className="flex w-[210px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line-soft bg-chrome px-2 py-3">
        <div className="flex flex-col gap-1 px-2.5 pb-2">
          <h1 className="m-0 text-[15px] font-semibold tracking-[-0.01em]">{t('Share previews', 'Aperçus de partage')}</h1>
          <span className="truncate font-mono text-[11px] text-faint" title={url}>
            {new URL(url).pathname}
          </span>
        </div>
        {FAMILIES().map((f) => {
          const list = cards.filter((c) => c.family === f.id);
          if (!list.length) return null;
          return (
            <div key={f.id} className="flex flex-col gap-0.5">
              <span className="label px-2.5 pt-3 pb-1">{f.label}</span>
              {list.map((c) => {
                const on = c === card;
                return (
                  <button
                    key={c.platform}
                    id={`share-${c.platform}`}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setPlatform(c.platform)}
                    className={`flex h-[34px] items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[12.5px] ${on ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-muted hover:bg-active/60 hover:text-fg'}`}
                  >
                    <Dot className={st[c.status].dot} />
                    {c.label}
                    {c.status !== 'ok' && <span className={`ml-auto text-[10.5px] ${st[c.status].color}`}>{st[c.status].text}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
        <span className="flex-1" />
        {cards.length > 0 && (
          <div className="flex flex-col gap-2 px-2.5 pt-3">
            <span className="text-[11.5px] text-muted">
              {t(
                `${counts.error} problem${counts.error > 1 ? 's' : ''} · ${counts.warning} to improve`,
                `${counts.error} problème${counts.error > 1 ? 's' : ''} · ${counts.warning} à améliorer`,
              )}
            </span>
            <span className="text-[11px] text-ghost">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t('to switch', 'pour changer')}
            </span>
          </div>
        )}
      </nav>

      <main className="stage-bg flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="flex items-center justify-end gap-3 px-5 pt-4">
          <span className="mr-auto text-xs text-faint">
            {t('Read by each platform’s crawler (raw HTML, no JavaScript). Renderings are approximate.', 'Lue par le robot de chaque plateforme (HTML brut, sans JavaScript). Rendus approximatifs.')}
          </span>
          <button onClick={() => void load(true)} disabled={loading} className="flex h-8 shrink-0 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium hover:border-line-strong disabled:opacity-60">
            <Icon name="reload" size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? t('Reading…', 'Lecture…') : t('Re-read', 'Relire')}
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          {error ? (
            <p className="m-0 text-err">
              {t('Couldn’t read:', 'Lecture impossible :')} {error}
            </p>
          ) : !card ? (
            <p className="m-0 text-faint">{t('Reading with the 7 crawlers…', 'Lecture par les 7 robots…')}</p>
          ) : (
            <section aria-label={t(`${card.label} preview`, `Aperçu ${card.label}`)}>
              <Scene c={card} />
            </section>
          )}
        </div>
      </main>

      {studio && card && (
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line-soft bg-chrome p-4 [&>*]:shrink-0">
          <div className="flex flex-col gap-1">
            <span className="flex items-center justify-between">
              <span className="label">{card.label}</span>
              <span className={`flex items-center gap-1.5 text-xs ${st[card.status].color}`}>
                <Dot className={st[card.status].dot} />
                {st[card.status].text}
              </span>
            </span>
            <span className="font-mono text-[11px] text-faint">
              {card.httpStatus ? `HTTP ${card.httpStatus}` : t('unreachable', 'injoignable')} · {card.domain}
            </span>
          </div>
          {card.problems.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {card.problems.map((pr) => (
                <li key={pr} className="flex gap-2.5 rounded-[9px] border border-line bg-card px-3 py-2.5 text-xs leading-snug text-muted">
                  <Dot className={`mt-1.5 ${st[card.status].dot}`} />
                  {pr}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 flex items-center gap-2 text-xs text-muted">
              <Icon name="check" size={13} className="text-ok" />
              {t(`Nothing to fix for ${card.label}.`, `Rien à corriger pour ${card.label}.`)}
            </p>
          )}
          <div className="h-px bg-line-soft" />
          <FixDetails studio={studio} />
        </aside>
      )}
    </div>
  );
}
