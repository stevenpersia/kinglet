import { auditPrompt, t, type SiteAudit } from '@kinglet/core';
import { useState } from 'react';
import { useStore } from '../store';
import { Dot, Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';

const card = 'shrink-0 overflow-hidden rounded-[10px] border border-line bg-card';

function Tile({ n, label, bad }: { n: number; label: string; bad: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-card px-3.5 py-3">
      <span className={`font-mono text-xl font-medium ${bad ? (n ? 'text-err' : 'text-ok') : 'text-fg'}`}>{n}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section className={card}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="font-semibold">{title}</span>
        <span className="font-mono text-xs text-muted">{count}</span>
      </div>
      <ul className="m-0 list-none border-t border-line-soft p-0">{children}</ul>
    </section>
  );
}

const Li = ({ children }: { children: React.ReactNode }) => <li className="flex flex-col gap-0.5 border-t border-line-soft px-3 py-2 first:border-t-0">{children}</li>;

/** Every page of the site: what only shows across pages, and each page's failing checks. */
export function SiteAuditView() {
  const s = useStore();
  const { audit, auditing, auditProgress, auditError, runAudit, url } = s;
  const [limit, setLimit] = useState(80);
  const [open, setOpen] = useState<string | null>(null);
  const sameOrigin = (a: SiteAudit) => !!url && new URL(url).origin === a.origin;
  const go = (path: string) => {
    if (!audit) return;
    void s.navigate(new URL(path, audit.origin).toString());
    s.setSection('apercu');
  };

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        {t('Up to', 'Jusqu’à')}
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-7 rounded-md border border-line bg-bg px-1.5 text-xs text-fg">
          {[30, 80, 150, 300].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        pages
      </label>
      <button onClick={() => void runAudit(limit)} disabled={auditing || !url} className="flex h-8 items-center gap-2 rounded-ui bg-fg px-3 font-semibold text-bg disabled:opacity-60">
        <Icon name="search" size={13} />
        {auditing ? t(`Reading ${auditProgress?.done ?? 0} / ${auditProgress?.queued ?? '…'}`, `Lecture ${auditProgress?.done ?? 0} / ${auditProgress?.queued ?? '…'}`) : audit ? t('Audit again', 'Réauditer') : t('Audit the site', 'Auditer le site')}
      </button>
    </div>
  );

  if (!audit || !sameOrigin(audit))
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 max-w-[640px] leading-relaxed text-muted">
          {t(
            'Reads every page found through the links, the sitemap and the rendered page, like Google (raw HTML). Finds broken links and dead anchors, duplicate titles and descriptions, pages missing from the sitemap, one-way hreflang, and the checks that fail on each page.',
            'Lit toutes les pages trouvées par les liens, le sitemap et la page rendue, comme Google (HTML brut). Trouve les liens cassés et les ancres mortes, les titres et descriptions en double, les pages absentes du sitemap, les hreflang à sens unique, et les checks qui échouent sur chaque page.',
          )}
        </p>
        {header}
        {auditError && <p className="m-0 text-err">{auditError}</p>}
      </div>
    );

  const bad = audit.pages.filter((p) => p.errors || p.warnings);
  const pageLinks = audit.brokenLinks.filter((b) => b.kind === 'page');
  const anchors = audit.brokenLinks.filter((b) => b.kind === 'anchor');
  const prompt = auditPrompt(audit);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {t(`${audit.pages.length} pages read`, `${audit.pages.length} pages lues`)}
          {audit.truncated ? t(` (stopped at ${audit.limit}: raise the limit for the rest)`, ` (arrêté à ${audit.limit} : monte la limite pour le reste)`) : ''} · {new Date(audit.at).toLocaleTimeString()}
        </span>
        <span className="flex items-center gap-2">
          {prompt && s.settings.claudePanel && (
            <button
              onClick={() => s.askClaude(t(`Kinglet audited ${audit.pages.length} pages of ${audit.origin}. Fix these problems in the code, then I will audit again:\n\n${prompt}`, `Kinglet a audité ${audit.pages.length} pages de ${audit.origin}. Corrige ces problèmes dans le code, puis je réaudite :\n\n${prompt}`))}
              className="flex h-8 items-center gap-1.5 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-3 text-xs font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]"
            >
              <Icon name="spark" size={12} />
              {t('Ask Claude', 'Demander à Claude')}
            </button>
          )}
          {prompt && <CopyButton text={SLASH.site} label={t(`Copy ${SLASH.site}`, `Copier ${SLASH.site}`)} done={t('Command copied ✓', 'Commande copiée ✓')} className="text-xs" />}
          {header}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Tile n={audit.pages.length} label={t('pages', 'pages')} bad={false} />
        <Tile n={bad.length} label={t('pages with problems', 'pages avec problèmes')} bad />
        <Tile n={pageLinks.length} label={t('broken links', 'liens cassés')} bad />
        <Tile n={anchors.length} label={t('dead anchors', 'ancres mortes')} bad />
        <Tile n={audit.duplicateTitles.length + audit.duplicateDescriptions.length} label={t('duplicates', 'doublons')} bad />
        <Tile n={audit.notInSitemap.length + audit.sitemapBroken.length} label={t('sitemap gaps', 'écarts du sitemap')} bad />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-4">
        <Section title={t('Broken links', 'Liens cassés')} count={pageLinks.length}>
          {pageLinks.map((b) => (
            <Li key={b.url}>
              <span className="flex items-center gap-2 font-mono text-xs">
                <Dot className="bg-err" />
                {b.path}
                <span className="text-err">{b.status ? `HTTP ${b.status}` : t('unreachable', 'injoignable')}</span>
              </span>
              <span className="text-[11.5px] text-muted">
                {t('linked from', 'lié depuis')}{' '}
                {b.from.slice(0, 6).map((f, i) => (
                  <button key={f} onClick={() => go(f)} className="font-mono text-fg hover:underline">
                    {f}
                    {i < Math.min(b.from.length, 6) - 1 ? ', ' : ''}
                  </button>
                ))}
                {b.from.length > 6 ? ` +${b.from.length - 6}` : ''}
              </span>
            </Li>
          ))}
        </Section>
        <Section title={t('Dead anchors', 'Ancres mortes')} count={anchors.length}>
          {anchors.map((b) => (
            <Li key={b.url}>
              <span className="flex items-center gap-2 font-mono text-xs">
                <Dot className="bg-warn" />
                {b.path}
              </span>
              <span className="text-[11.5px] text-muted">
                {audit.anchorsRendered
                  ? t('No element with this id, even after JavaScript. Linked from', 'Aucun élément avec cet id, même après JavaScript. Lié depuis')
                  : t('No element with this id in the HTML. Linked from', 'Aucun élément avec cet id dans le HTML. Lié depuis')}{' '}
                <span className="font-mono">{b.from.join(', ')}</span>
              </span>
            </Li>
          ))}
        </Section>
        <Section title={t('Duplicate titles', 'Titres en double')} count={audit.duplicateTitles.length}>
          {audit.duplicateTitles.map((d) => (
            <Li key={d.value}>
              <span className="text-xs text-fg">« {d.value} »</span>
              <span className="font-mono text-[11.5px] text-muted">{d.paths.join(', ')}</span>
            </Li>
          ))}
        </Section>
        <Section title={t('Duplicate descriptions', 'Descriptions en double')} count={audit.duplicateDescriptions.length}>
          {audit.duplicateDescriptions.map((d) => (
            <Li key={d.value}>
              <span className="line-clamp-2 text-xs text-fg">« {d.value} »</span>
              <span className="font-mono text-[11.5px] text-muted">{d.paths.join(', ')}</span>
            </Li>
          ))}
        </Section>
        <Section title={t('Missing from the sitemap', 'Absentes du sitemap')} count={audit.notInSitemap.length + audit.sitemapBroken.length}>
          {audit.notInSitemap.map((p) => (
            <Li key={p}>
              <span className="font-mono text-xs">{p}</span>
            </Li>
          ))}
          {audit.sitemapBroken.map((b) => (
            <Li key={b.url}>
              <span className="font-mono text-xs text-err">
                {new URL(b.url).pathname} · {t('in the sitemap but', 'dans le sitemap mais')} {b.status ? `HTTP ${b.status}` : t('unreachable', 'injoignable')}
              </span>
            </Li>
          ))}
        </Section>
        <Section title="hreflang" count={audit.hreflang.length}>
          {audit.hreflang.map((h, i) => (
            <Li key={i}>
              <span className="font-mono text-xs">{h.path}</span>
              <span className="text-[11.5px] text-muted">{h.message}</span>
            </Li>
          ))}
        </Section>
      </div>

      <section className={card}>
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="font-semibold">{t('Pages', 'Pages')}</span>
          <span className="font-mono text-xs text-muted">{t('problems first', 'problèmes d’abord')}</span>
        </div>
        <ul className="m-0 list-none border-t border-line-soft p-0">
          {audit.pages.map((p) => (
            <li key={p.url} className="border-t border-line-soft first:border-t-0">
              <div className="flex items-center gap-3 px-3 py-2">
                <Dot className={p.status == null || p.status >= 400 || p.errors ? 'bg-err' : p.warnings ? 'bg-warn' : 'bg-ok'} />
                <button onClick={() => setOpen(open === p.url ? null : p.url)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="truncate font-mono text-xs text-fg">{p.path}</span>
                  <span className="truncate text-xs text-faint">{p.title ?? ''}</span>
                </button>
                {p.noindex && <span className="rounded border border-line px-1.5 text-[10.5px] text-faint">noindex</span>}
                <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">{p.score ? `${p.score.passed}/${p.score.total}` : p.status ? `HTTP ${p.status}` : '—'}</span>
                <button onClick={() => go(p.path)} title={t('Open on the devices', 'Ouvrir sur les appareils')} aria-label={t(`Open ${p.path}`, `Ouvrir ${p.path}`)} className="flex size-6 items-center justify-center rounded text-ghost hover:bg-active hover:text-fg">
                  <Icon name="eye" size={12} />
                </button>
              </div>
              {open === p.url && p.problems.length > 0 && (
                <ul className="m-0 list-none px-3 pb-2.5 pl-8">
                  {p.problems.map((c) => (
                    <li key={c.id} className="flex gap-2 py-0.5 text-xs">
                      <Dot className={`mt-1.5 ${c.status === 'error' ? 'bg-err' : 'bg-warn'}`} />
                      <span>
                        <span className="text-fg">{c.label}</span> <span className="text-muted">— {c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
