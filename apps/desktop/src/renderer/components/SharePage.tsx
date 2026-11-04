import type { PlatformFamily, ShareCard } from '@parakeet/core';
import { useEffect, useState } from 'react';
import type { ShareStudio } from '../../shared/types';
import { api, cleanError, useStore } from '../store';
import { Dot, Icon } from './Icons';
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

const STATUS = {
  ok: { dot: 'bg-ok', text: 'OK', color: 'text-muted' },
  warning: { dot: 'bg-warn', text: 'À améliorer', color: 'text-warn' },
  error: { dot: 'bg-err', text: 'Problème', color: 'text-err' },
} as const;

function PlatformCard({ c }: { c: ShareCard }) {
  const s = STATUS[c.status];
  return (
    <section aria-label={c.label} className="flex h-fit flex-col gap-2.5 rounded-[10px] border border-line bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{c.label}</span>
        <span className={`flex items-center gap-1.5 text-xs ${s.color}`}>
          <Dot className={s.dot} />
          {s.text}
        </span>
      </div>
      <Preview c={c} />
      {c.problems.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {c.problems.map((p) => (
            <li key={p} className="text-xs leading-snug text-muted">
              {p}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- fix panel ---------------- */

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="m-0 rounded-[10px] border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-muted">
      {code.split('\n').map((line, i) => {
        const added = line.includes('← ajouté');
        return (
          <span key={i} className={`block ${added ? 'bg-ok/10 text-ok' : ''}`}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}

function FixPanel({ studio }: { studio: ShareStudio }) {
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
    <aside className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line-soft bg-chrome p-4">
      <div className="flex items-baseline justify-between">
        <span className="label">Balises lues</span>
        <span className="font-mono text-[11px] text-faint">{fix.frameworkLabel} détecté</span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2.5 border-t border-line-soft px-3 py-1.5 first:border-t-0">
            <Dot className={v ? 'bg-ok' : 'bg-warn'} />
            <span className="w-28 shrink-0 font-mono text-[11.5px] text-faint">{k}</span>
            <span className={`min-w-0 truncate text-xs ${v ? 'text-fg' : 'text-warn'}`}>{v ?? 'absent'}</span>
          </div>
        ))}
      </div>

      {fix.changes.length === 0 ? (
        <p className="m-0 text-muted">Rien à corriger : toutes les balises de partage sont en place.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="label">Correctif</span>
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
              {copied === 'prompt' ? 'Prompt copié ✓' : 'Copier le prompt pour Claude'}
            </button>
            <button onClick={() => copy('code', fix.code)} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong">
              {copied === 'code' ? 'Copié ✓' : 'Code'}
            </button>
          </div>
          <CopyButton text={SLASH.share} label={`Copier ${SLASH.share}`} done="Commande copiée : colle-la dans Claude Code ✓" className="text-xs" />
        </>
      )}
      <p className="m-0 text-xs leading-relaxed text-faint">
        WhatsApp et LinkedIn gardent l’ancien aperçu en cache plusieurs jours. Pour tester une correction, ajoute <span className="font-mono text-fg">?v=2</span> au lien partagé.
      </p>
    </aside>
  );
}

/* ---------------- page ---------------- */

const FILTERS: { id: PlatformFamily | 'all'; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'messagerie', label: 'Messageries' },
  { id: 'reseau', label: 'Réseaux' },
  { id: 'recherche', label: 'Recherche' },
];

const cache = new Map<string, ShareStudio>();

export function SharePage() {
  const url = useStore((s) => s.url);
  const status = useStore((s) => s.status);
  const [studio, setStudio] = useState<ShareStudio | null>(url ? (cache.get(url) ?? null) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<PlatformFamily | 'all'>('all');

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

  if (!url) return <main className="stage-bg flex flex-1 items-center justify-center text-faint">Ouvre un site pour voir ses aperçus de partage.</main>;
  const cards = studio?.previews.cards.filter((c) => filter === 'all' || c.family === filter) ?? [];
  const counts = studio ? { error: studio.previews.cards.filter((c) => c.status === 'error').length, warning: studio.previews.cards.filter((c) => c.status === 'warning').length } : null;

  return (
    <div className="flex min-w-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">Aperçus de partage</h1>
            <p className="m-0 mt-1 text-muted">
              <span className="font-mono text-xs">{new URL(url).pathname}</span> lue par le robot de chaque plateforme (HTML brut, sans JavaScript). Rendus et limites approximatifs.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {counts && (
              <span className="text-xs text-muted">
                {counts.error} problème{counts.error > 1 ? 's' : ''} · {counts.warning} à améliorer
              </span>
            )}
            <button onClick={() => void load(true)} disabled={loading} className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium hover:border-line-strong disabled:opacity-60">
              <Icon name="reload" size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Lecture…' : 'Relire'}
            </button>
          </div>
        </div>
        <div role="group" aria-label="Filtrer" className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex h-[26px] items-center rounded-md border px-2.5 text-xs ${filter === f.id ? 'border-line-strong bg-active font-medium text-fg' : 'border-line text-muted hover:border-line-strong'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {error && <p className="m-0 text-err">Lecture impossible : {error}</p>}
        {!studio && !error && <p className="m-0 text-faint">Lecture par les 7 robots…</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {cards.map((c) => (
            <PlatformCard key={c.platform} c={c} />
          ))}
        </div>
      </main>
      {studio && <FixPanel studio={studio} />}
    </div>
  );
}
