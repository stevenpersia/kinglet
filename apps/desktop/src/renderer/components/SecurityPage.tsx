import { headersFix, SECURITY_GROUPS, SECURITY_HEADERS, securityPrompt, t, type SecurityCheck, type SecurityGroup, type SecurityStatus } from '@kinglet/core';
import { useEffect, useState, type ReactNode } from 'react';
import type { SecurityRun } from '../../shared/types';
import { api, useStore } from '../store';
import { Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';

const DOT: Record<SecurityStatus, string> = { ok: 'bg-ok', info: 'bg-local', warning: 'bg-warn', error: 'bg-err', skip: 'bg-ghost' };
const RANK: Record<SecurityStatus, number> = { error: 0, warning: 1, info: 2, ok: 3, skip: 4 };
const HEADER_CHECKS = new Set(['hsts', 'csp', 'nosniff', 'framing', 'referrer', 'permissions']);
const mono = 'font-mono text-[11.5px]';
const isProblem = (c: SecurityCheck) => c.status === 'error' || c.status === 'warning';

/** One cell of the summary band: the family, its worst status, and what it comes to in a few words. */
function familySummary(r: SecurityRun, g: SecurityGroup): { status: SecurityStatus; text: string } {
  const items = r.checks.filter((c) => c.group === g);
  const status = items.map((c) => c.status).sort((a, b) => RANK[a] - RANK[b])[0] ?? 'skip';
  const toFix = items.filter(isProblem).length;
  const text = (() => {
    if (g === 'secrets') {
      if (r.secrets.length) return t(`${r.secrets.length} key${r.secrets.length > 1 ? 's' : ''} leaked`, `${r.secrets.length} clé${r.secrets.length > 1 ? 's' : ''} exposée${r.secrets.length > 1 ? 's' : ''}`);
      if (r.sourceMaps.length) return t(`${r.sourceMaps.length} source map${r.sourceMaps.length > 1 ? 's' : ''}`, `${r.sourceMaps.length} source map${r.sourceMaps.length > 1 ? 's' : ''}`);
      return t('Clean', 'Rien');
    }
    if (g === 'files') return !r.probed ? t('Not tried', 'Non essayé') : r.exposedFiles.length ? t(`${r.exposedFiles[0]!.path} open`, `${r.exposedFiles[0]!.path} ouvert`) : t('None open', 'Aucun ouvert');
    if (g === 'headers') return r.local ? t('On previews', 'Sur les previews') : t(`${SECURITY_HEADERS.filter((h) => r.headers[h]).length} of ${SECURITY_HEADERS.length}`, `${SECURITY_HEADERS.filter((h) => r.headers[h]).length} sur ${SECURITY_HEADERS.length}`);
    if (g === 'cookies') return !r.cookies.length ? t('None set', 'Aucun') : toFix ? t(`${toFix} to fix`, `${toFix} à corriger`) : t('All flagged', 'Tous protégés');
    if (g === 'thirdparty') return r.thirdParty.length ? t(`${r.thirdParty.length} domain${r.thirdParty.length > 1 ? 's' : ''}`, `${r.thirdParty.length} domaine${r.thirdParty.length > 1 ? 's' : ''}`) : t('None', 'Aucun');
    return status === 'skip' ? t('Not checked', 'Non vérifié') : toFix ? t(`${toFix} to fix`, `${toFix} à corriger`) : t('All good', 'Tout va bien');
  })();
  return { status, text };
}

/** What a problem shows once opened: the evidence, and what to do about it. */
function Evidence({ c, r }: { c: SecurityCheck; r: SecurityRun }) {
  const [file, setFile] = useState(0);
  const row = (k: string, v: ReactNode) => (
    <>
      <span className="text-faint">{k}</span>
      <span className="min-w-0 break-words">{v}</span>
    </>
  );
  if (c.id === 'secrets')
    return (
      <div className="flex flex-col gap-3">
        {r.secrets.map((x) => (
          <div key={x.kind + x.preview} className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            {row(t('Key', 'Clé'), <span className="font-medium">{x.kind}</span>)}
            {row(t('Value', 'Valeur'), <span className={mono}>{x.preview}</span>)}
            {row(t('Found in', 'Trouvée dans'), <span className={`${mono} text-muted`}>{x.where}</span>)}
          </div>
        ))}
        <p className="m-0 text-[12.5px] text-muted">
          {t('Revoke it at the provider now, then move the call to a server route. A key that reached a browser is public, even once removed.', 'Révoque-la tout de suite chez le fournisseur, puis passe l’appel dans une route serveur. Une clé arrivée dans un navigateur est publique, même une fois retirée.')}
        </p>
      </div>
    );
  if (c.id === 'exposed-files')
    return (
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
        {r.exposedFiles.map((f) => (
          <li key={f.path} className="flex flex-wrap gap-x-3">
            <button onClick={() => api().openExternal(f.url)} className={`${mono} text-fg hover:underline`}>
              {f.path}
            </button>
            <span className="text-muted">{f.what}</span>
          </li>
        ))}
      </ul>
    );
  if (c.id === 'source-maps' || c.id === 'mixed' || c.id === 'forms' || c.id === 'sri') {
    const list = c.id === 'source-maps' ? r.sourceMaps : c.id === 'mixed' ? r.mixedContent : c.id === 'forms' ? r.insecureForms : r.thirdParty.flatMap((tp) => tp.withoutIntegrity);
    return (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {list.map((x) => (
          <li key={x} className={`${mono} break-all text-muted`}>
            {x}
          </li>
        ))}
      </ul>
    );
  }
  if (c.id === 'cookies')
    return (
      <table className="w-fit border-collapse text-xs">
        <thead>
          <tr className="text-faint">
            <th className="py-1 pr-6 text-left font-normal" />
            <th className="px-3 py-1 font-normal">Secure</th>
            <th className="px-3 py-1 font-normal">HttpOnly</th>
            <th className="px-3 py-1 font-normal">SameSite</th>
          </tr>
        </thead>
        <tbody>
          {r.cookies.map((k) => (
            <tr key={k.name}>
              <td className={`py-1 pr-6 ${mono}`}>
                {k.name}
                {k.session && <span className="ml-2 text-[10.5px] text-faint">{t('session', 'session')}</span>}
              </td>
              <td className={`px-3 py-1 text-center ${k.secure ? 'text-ok' : 'text-warn'}`}>{k.secure ? '✓' : '—'}</td>
              <td className={`px-3 py-1 text-center ${k.httpOnly ? 'text-ok' : k.session ? 'text-err' : 'text-ghost'}`}>{k.httpOnly ? '✓' : '—'}</td>
              <td className={`px-3 py-1 text-center ${k.sameSite ? 'text-ok' : 'text-warn'}`}>{k.sameSite ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (HEADER_CHECKS.has(c.id)) {
    const missing = SECURITY_HEADERS.filter((h) => !r.headers[h]);
    const fixes = headersFix(r.framework, missing);
    const current = fixes[Math.min(file, fixes.length - 1)]!;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {fixes.map((f, i) => (
            <button key={f.file} onClick={() => setFile(i)} className={`h-7 rounded-md px-2.5 text-xs ${i === file ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#26262b]' : 'text-muted hover:text-fg'}`}>
              {f.file}
            </button>
          ))}
          <span className="flex-1" />
          <CopyButton text={current.code} label={t('Copy the fix', 'Copier le correctif')} />
        </div>
        <pre className="m-0 max-h-56 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-fg select-text">{current.code}</pre>
        <span className="text-xs text-muted">
          {t(`Covers every missing header (${missing.length}). The Content-Security-Policy starts in Report-Only: check nothing legitimate is blocked, then enforce it.`, `Couvre tous les en-têtes manquants (${missing.length}). La Content-Security-Policy commence en Report-Only : vérifie que rien de légitime n’est bloqué, puis applique-la.`)}
        </span>
      </div>
    );
  }
  return null;
}

function Problem({ c, r, open, onToggle, onAsk }: { c: SecurityCheck; r: SecurityRun; open: boolean; onToggle: () => void; onAsk?: (c: SecurityCheck) => void }) {
  const family = SECURITY_GROUPS.find((g) => g.id === c.group)?.label() ?? '';
  return (
    <li className={`border-t border-line-soft first:border-t-0 ${open ? (c.status === 'error' ? 'bg-err/[0.035]' : 'bg-warn/[0.03]') : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className={`shrink-0 rounded-[5px] px-2 py-0.5 font-mono text-[10.5px] ${c.status === 'error' ? 'bg-err/12 text-err' : 'bg-warn/12 text-warn'}`}>
            {c.status === 'error' ? t('PROBLEM', 'PROBLÈME') : t('IMPROVE', 'À AMÉLIORER')}
          </span>
          <span className="shrink-0 text-[13.5px] font-semibold">{c.label}</span>
          <span className="shrink-0 text-faint">{family}</span>
          <span className={`min-w-0 flex-1 truncate text-right text-[12.5px] text-muted ${open ? 'invisible' : ''}`}>{c.detail}</span>
          <Icon name="chevrons" size={13} className="shrink-0 text-ghost" />
        </button>
        {onAsk && (
          <button onClick={() => onAsk(c)} className="h-7 shrink-0 rounded-md border border-[rgba(217,119,87,0.3)] px-2.5 text-xs font-medium text-[#f0a07f] hover:bg-[rgba(217,119,87,0.08)]">
            {t('Ask Claude', 'Demander à Claude')}
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-3 pr-4 pb-4 pl-4 sm:pl-[106px]">
          <p className="m-0 text-[12.5px] text-[#c4c4cc]">{c.detail}</p>
          <Evidence c={c} r={r} />
        </div>
      )}
    </li>
  );
}

/** Passed checks of some families, one short line each with its value. */
function PassedBlock({ title, checks }: { title: string; checks: SecurityCheck[] }) {
  if (!checks.length) return null;
  const ok = checks.filter((c) => c.status === 'ok').length;
  return (
    <section aria-label={title} className="h-fit overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between px-4 py-3 font-semibold">
        {title}
        <span className="font-mono text-xs font-normal text-ok">
          {ok}/{checks.filter((c) => c.status !== 'info').length || checks.length}
        </span>
      </div>
      <ul className="m-0 list-none border-t border-line-soft p-0">
        {checks.map((c) => (
          <li key={c.id} className="grid grid-cols-[14px_minmax(0,9.5rem)_minmax(0,1fr)] items-baseline gap-2.5 border-t border-line-soft px-4 py-2.5 first:border-t-0">
            <span className={c.status === 'ok' ? 'text-ok' : 'text-local'}>{c.status === 'ok' ? '✓' : 'i'}</span>
            <span className="truncate">{c.label}</span>
            <span className={`truncate text-xs text-faint ${HEADER_CHECKS.has(c.id) ? 'font-mono text-[11.5px]' : ''}`} title={c.detail}>
              {c.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Security of the page shown: what to fix first (opened, with the evidence and the fix), then what
 * passed in short lines, then what couldn't be checked here. A section of its own, next to Checks.
 */
export function SecurityPage() {
  const s = useStore();
  const { url, security, securityRunning, securityError, runSecurity, status } = s;
  const [opened, setOpened] = useState<string | null>(null);
  const stale = !!security && !!url && security.url !== url;

  useEffect(() => {
    if (url && status === 'loaded' && !securityRunning && (!security || security.url !== url)) void runSecurity(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, status]);

  if (!url)
    return (
      <main className="stage-bg flex flex-1 items-center justify-center">
        <p className="m-0 text-faint">{t('Open a site to check its security.', 'Ouvre un site pour vérifier sa sécurité.')}</p>
      </main>
    );
  if (!security || stale)
    return (
      <main className="stage-bg flex flex-1 flex-col items-center justify-center gap-3">
        <p className="m-0 text-faint">{securityError ?? t('Reading the page, its scripts and its headers…', 'Lecture de la page, de ses scripts et de ses en-têtes…')}</p>
        {securityError && (
          <button onClick={() => void runSecurity(url)} className="h-8 rounded-ui bg-fg px-3 font-semibold text-bg">
            {t('Try again', 'Réessayer')}
          </button>
        )}
      </main>
    );

  const r = security;
  const problems = r.checks.filter(isProblem).sort((a, b) => RANK[a.status] - RANK[b.status]);
  const errors = problems.filter((c) => c.status === 'error').length;
  const open = opened ?? problems[0]?.id ?? null;
  const ask = s.settings.claudePanel ? (c: SecurityCheck) => s.askClaude(t(`Fix this security problem on ${r.finalUrl}: ${c.label}. ${c.detail}`, `Corrige ce problème de sécurité sur ${r.finalUrl} : ${c.label}. ${c.detail}`)) : undefined;
  const passed = (groups: SecurityGroup[]) => r.checks.filter((c) => groups.includes(c.group) && (c.status === 'ok' || c.status === 'info'));
  const skipped = r.checks.filter((c) => c.status === 'skip');
  const kb = Math.max(1, Math.round(r.scanned.bytes / 1024));

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 flex items-center gap-2.5 text-xl font-semibold tracking-[-0.02em]">
            <Icon name="shield" size={18} />
            {t('Security', 'Sécurité')}
          </h1>
          <p className="m-0 mt-1.5 text-muted">
            <span className="font-mono text-xs text-fg">{r.finalUrl}</span> ·{' '}
            {t(`${r.scanned.scripts} script${r.scanned.scripts > 1 ? 's' : ''} (${kb} KB) and headers, read as a visitor’s browser gets them`, `${r.scanned.scripts} script${r.scanned.scripts > 1 ? 's' : ''} (${kb} Ko) et en-têtes, lus comme le navigateur d’un visiteur les reçoit`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {problems.length > 0 && s.settings.claudePanel && (
            <button onClick={() => s.askClaude(securityPrompt(r))} className="h-8 rounded-ui bg-[#d97757] px-3 font-semibold text-[#1a120b] hover:brightness-110">
              {t(`Ask Claude to fix all ${problems.length}`, `Tout faire corriger par Claude (${problems.length})`)}
            </button>
          )}
          {problems.length > 0 && <CopyButton text={SLASH.security} label={t('Copy the command', 'Copier la commande')} done={t('Command copied: paste it into Claude Code ✓', 'Commande copiée : colle-la dans Claude Code ✓')} />}
          <button
            onClick={() => void runSecurity(url, { probe: r.probed })}
            disabled={securityRunning}
            className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60"
          >
            <Icon name="reload" size={13} className={securityRunning ? 'animate-spin' : ''} />
            {securityRunning ? t('Checking…', 'Vérification…') : t('Re-run', 'Relancer')}
          </button>
        </div>
      </header>

      {problems.length ? (
        <section aria-label={t('Summary', 'Résumé')} className="grid overflow-hidden rounded-xl border border-line bg-card [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
          <div className="flex flex-col gap-1 border-r border-line px-5 py-4">
            <span className="font-mono text-[28px] leading-none font-medium tracking-[-0.02em]">
              <span className={errors ? 'text-err' : 'text-warn'}>{r.score.passed}</span>
              <span className="text-ghost">/{r.score.total}</span>
            </span>
            <span className={`mt-1 font-medium ${errors ? 'text-err' : 'text-warn'}`}>{t(`${errors} problem${errors > 1 ? 's' : ''}`, `${errors} problème${errors > 1 ? 's' : ''}`)}</span>
            <span className="text-xs text-muted">{t(`${problems.length - errors} to improve`, `${problems.length - errors} à améliorer`)}</span>
          </div>
          {SECURITY_GROUPS.map((g) => {
            const f = familySummary(r, g.id);
            return (
              <div key={g.id} className="flex flex-col gap-2 border-r border-line-soft px-4 py-4 last:border-r-0">
                <span className="flex items-center gap-2 text-muted">
                  <span className={`size-[7px] shrink-0 rounded-full ${DOT[f.status]}`} />
                  <span className="truncate">{g.label()}</span>
                </span>
                <span className="truncate text-[14.5px] font-semibold">{f.text}</span>
              </div>
            );
          })}
        </section>
      ) : (
        <section aria-label={t('Summary', 'Résumé')} className="flex items-center gap-5 rounded-xl border border-ok/25 bg-ok/[0.05] px-6 py-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Icon name="check" size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-semibold">{t('Nothing to fix', 'Rien à corriger')}</span>
            <span className="text-muted">
              {r.local
                ? t('No secret in the code, no sensitive file open. Headers and HTTPS are judged on previews and production.', 'Aucun secret dans le code, aucun fichier sensible ouvert. En-têtes et HTTPS sont jugés sur les previews et la prod.')
                : t('No secret in the code, no sensitive file open, the security headers set, everything over https.', 'Aucun secret dans le code, aucun fichier sensible ouvert, les en-têtes de sécurité en place, tout en https.')}
            </span>
          </div>
          <span className="font-mono text-[26px] font-medium">
            <span className="text-ok">{r.score.passed}</span>
            <span className="text-ghost">/{r.score.total}</span>
          </span>
        </section>
      )}

      {!r.probed && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3">
          <span className="min-w-0 flex-1 text-[13px] text-muted">
            {t(
              'Sensitive files (.env, .git, dumps…) weren’t tried: this site isn’t one of your projects. Kinglet only does it on sites you own.',
              'Les fichiers sensibles (.env, .git, sauvegardes…) n’ont pas été essayés : ce site n’est pas un de tes projets. Kinglet ne le fait que sur tes propres sites.',
            )}
          </span>
          <button onClick={() => void runSecurity(url, { probe: true })} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong">
            {t('It’s my site: check them', 'C’est mon site : les vérifier')}
          </button>
        </div>
      )}

      {problems.length > 0 && (
        <section aria-label={t('To fix', 'À corriger')} className="flex flex-col gap-2.5">
          <h2 className="label m-0">{t(`To fix · ${problems.length}`, `À corriger · ${problems.length}`)}</h2>
          <ul className="m-0 list-none overflow-hidden rounded-xl border border-line bg-card p-0">
            {problems.map((c) => (
              <Problem key={c.id} c={c} r={r} open={open === c.id} onToggle={() => setOpened(open === c.id ? '' : c.id)} onAsk={ask} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t('Passed', 'Réussi')} className="flex flex-col gap-2.5">
        {problems.length > 0 && <h2 className="label m-0">{t(`Passed · ${r.checks.filter((c) => c.status === 'ok').length}`, `Réussi · ${r.checks.filter((c) => c.status === 'ok').length}`)}</h2>}
        <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          <PassedBlock title={t('Secrets & files', 'Secrets et fichiers')} checks={passed(['secrets', 'files'])} />
          <PassedBlock title={t('Headers', 'En-têtes')} checks={passed(['headers'])} />
          <PassedBlock title={t('Transport, cookies & third parties', 'Transport, cookies et tiers')} checks={passed(['transport', 'cookies', 'thirdparty'])} />
        </div>
      </section>

      {skipped.length > 0 && (
        <p className="m-0 text-xs leading-relaxed text-ghost">
          {t('Not checked here: ', 'Non vérifié ici : ')}
          {r.local
            ? `${skipped.map((c) => c.label).join(', ')}. ${t('Normal on a dev server: they’re checked on previews and production.', 'Normal sur un serveur de dev : ils sont vérifiés sur les previews et la prod.')}`
            : `${skipped.map((c) => `${c.label} (${c.detail.replace(/\.$/, '').toLowerCase()})`).join(' · ')}.`}
        </p>
      )}
    </main>
  );
}
