import { headersFix, SECURITY_GROUPS, SECURITY_HEADERS, securityPrompt, t, type SecurityCheck, type SecurityStatus } from '@kinglet/core';
import { useEffect, type ReactNode } from 'react';
import { api, useStore } from '../store';
import { Dot, Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';

const DOT: Record<SecurityStatus, string> = { ok: 'bg-ok', info: 'bg-local', warning: 'bg-warn', error: 'bg-err', skip: 'bg-ghost' };
const ORDER: Record<SecurityStatus, number> = { error: 0, warning: 1, info: 2, ok: 3, skip: 4 };

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="h-fit overflow-hidden rounded-[10px] border border-line bg-card">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="font-semibold">{title}</span>
        {aside}
      </div>
      <div className="border-t border-line-soft">{children}</div>
    </section>
  );
}

function CheckRow({ c, onAsk }: { c: SecurityCheck; onAsk?: (c: SecurityCheck) => void }) {
  return (
    <li className="group flex gap-2.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
      <Dot className={`mt-1.5 ${DOT[c.status]}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{c.label}</span>
        <span className="text-xs leading-normal break-words text-muted">{c.detail}</span>
      </div>
      {onAsk && (c.status === 'error' || c.status === 'warning') && (
        <button onClick={() => onAsk(c)} className="h-6 shrink-0 self-start rounded-md px-2 text-[11.5px] text-[#d97757] opacity-0 group-hover:opacity-100 hover:bg-active focus-visible:opacity-100">
          {t('Ask Claude', 'Demander à Claude')}
        </button>
      )}
    </li>
  );
}

const mono = 'font-mono text-[11.5px] break-all';

/**
 * Security of the page shown: secrets in its JavaScript, sensitive files, headers, cookies,
 * mixed content and third parties. A section of its own, next to Checks.
 */
export function SecurityPage() {
  const s = useStore();
  const { url, security, securityRunning, securityError, runSecurity, status } = s;
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
  const errors = r.checks.filter((c) => c.status === 'error').length;
  const warnings = r.checks.filter((c) => c.status === 'warning').length;
  const ask = s.settings.claudePanel ? (c: SecurityCheck) => s.askClaude(t(`Fix this security problem on ${r.finalUrl}: ${c.label}. ${c.detail}`, `Corrige ce problème de sécurité sur ${r.finalUrl} : ${c.label}. ${c.detail}`)) : undefined;
  const missing = SECURITY_HEADERS.filter((h) => !r.headers[h]);
  const fixes = !r.local && missing.length ? headersFix(r.framework, missing) : [];
  const noSri = r.thirdParty.flatMap((tp) => tp.withoutIntegrity);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 flex items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
            <Icon name="shield" size={18} />
            {t('Security', 'Sécurité')}
          </h1>
          <p className="m-0 mt-1 text-muted">
            <span className="font-mono text-xs">{r.finalUrl}</span> ·{' '}
            {t(
              `HTML, ${r.scanned.scripts} script${r.scanned.scripts > 1 ? 's' : ''} (${Math.max(1, Math.round(r.scanned.bytes / 1024))} KB) and headers, as a visitor’s browser gets them.`,
              `HTML, ${r.scanned.scripts} script${r.scanned.scripts > 1 ? 's' : ''} (${Math.max(1, Math.round(r.scanned.bytes / 1024))} Ko) et en-têtes, tels que le navigateur d’un visiteur les reçoit.`,
            )}
            {r.local && ` ${t('Headers and HTTPS are judged on previews and production.', 'En-têtes et HTTPS sont jugés sur les previews et la prod.')}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className={`font-mono text-2xl font-medium tracking-[-0.02em] ${errors ? 'text-err' : ''}`}>
              {r.score.passed}
              <span className="text-faint">/{r.score.total}</span>
            </div>
            <div className="text-xs text-muted">{t(`${errors} problem${errors > 1 ? 's' : ''} · ${warnings} to improve`, `${errors} problème${errors > 1 ? 's' : ''} · ${warnings} à améliorer`)}</div>
          </div>
          {errors + warnings > 0 && s.settings.claudePanel && (
            <button onClick={() => s.askClaude(securityPrompt(r))} className="h-8 rounded-ui bg-[#d97757] px-3 font-semibold text-[#1a120b]">
              {t('Ask Claude to fix it all', 'Tout faire corriger par Claude')}
            </button>
          )}
          {errors + warnings > 0 && <CopyButton text={SLASH.security} label={t('Copy the command', 'Copier la commande')} done={t('Command copied: paste it into Claude Code ✓', 'Commande copiée : colle-la dans Claude Code ✓')} />}
          <button
            onClick={() => void runSecurity(url, { probe: r.probed })}
            disabled={securityRunning}
            className="flex h-8 items-center gap-2 rounded-ui border border-[#2a2a2f] bg-active px-3 font-medium text-fg hover:border-line-strong disabled:opacity-60"
          >
            <Icon name="reload" size={13} className={securityRunning ? 'animate-spin' : ''} />
            {securityRunning ? t('Checking…', 'Vérification…') : t('Re-run', 'Relancer')}
          </button>
        </div>
      </div>

      {!r.probed && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-warn/30 bg-warn/[0.06] px-4 py-3">
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-4">
        {SECURITY_GROUPS.map((g) => {
          const items = r.checks.filter((c) => c.group === g.id).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
          if (!items.length) return null;
          const counted = items.filter((c) => c.status !== 'skip' && c.status !== 'info');
          const passed = counted.filter((c) => c.status === 'ok').length;
          return (
            <Card key={g.id} title={g.label()} aside={counted.length ? <span className={`font-mono text-xs ${passed === counted.length ? 'text-ok' : 'text-muted'}`}>{passed}/{counted.length}</span> : null}>
              <ul className="m-0 list-none p-0">
                {items.map((c) => (
                  <CheckRow key={c.id} c={c} onAsk={ask} />
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-4">
        {r.secrets.length > 0 && (
          <Card title={t('Secrets found', 'Secrets trouvés')} aside={<span className="font-mono text-xs text-err">{r.secrets.length}</span>}>
            <ul className="m-0 list-none p-0">
              {r.secrets.map((x) => (
                <li key={x.kind + x.preview} className="flex flex-col gap-0.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                  <span className="flex items-center gap-2 font-medium">
                    <Dot className={x.severity === 'error' ? 'bg-err' : 'bg-warn'} />
                    {x.kind}
                    <code className={`${mono} text-faint`}>{x.preview}</code>
                  </span>
                  <span className={`${mono} text-muted`}>{x.where}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 border-t border-line-soft px-3 py-2.5 text-xs text-muted">
              {t('A key that reached a browser is public: revoke it at the provider, even after removing it from the code.', 'Une clé arrivée dans un navigateur est publique : révoque-la chez le fournisseur, même après l’avoir retirée du code.')}
            </p>
          </Card>
        )}

        {(r.exposedFiles.length > 0 || r.sourceMaps.length > 0) && (
          <Card title={t('Reachable files', 'Fichiers accessibles')}>
            <ul className="m-0 list-none p-0">
              {r.exposedFiles.map((f) => (
                <li key={f.path} className="flex flex-col gap-0.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                  <span className="flex items-center gap-2">
                    <Dot className="bg-err" />
                    <button onClick={() => api().openExternal(f.url)} className={`${mono} text-left text-fg hover:underline`}>
                      {f.path}
                    </button>
                  </span>
                  <span className="text-xs text-muted">{f.what}</span>
                </li>
              ))}
              {r.sourceMaps.map((m) => (
                <li key={m} className="flex items-center gap-2 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                  <Dot className="bg-warn" />
                  <span className={`${mono} text-muted`}>{m}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t('Headers', 'En-têtes')}>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {SECURITY_HEADERS.map((h) => (
                <tr key={h}>
                  <td className="w-[44%] border-t border-line-soft px-3 py-2 align-top font-mono text-[11.5px] text-faint first:border-t-0">{h}</td>
                  <td className={`border-t border-line-soft px-3 py-2 align-top break-all ${r.headers[h] ? 'text-fg' : 'text-ghost'}`}>{r.headers[h] ?? t('missing', 'absent')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fixes.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-line-soft p-3">
              <span className="label">{t(`The fix, for ${r.framework === 'html' || r.framework === 'vite' ? 'Vercel' : r.framework}`, `Le correctif, pour ${r.framework === 'html' || r.framework === 'vite' ? 'Vercel' : r.framework}`)}</span>
              {fixes.map((f) => (
                <div key={f.file} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11.5px] text-muted">{f.file}</span>
                    <CopyButton text={f.code} label={t('Copy', 'Copier')} />
                  </div>
                  <pre className="m-0 max-h-52 overflow-auto rounded-ui border border-line bg-bg p-2.5 font-mono text-[11px] leading-relaxed text-fg select-text">{f.code}</pre>
                </div>
              ))}
              <span className="text-xs text-muted">
                {t('The Content-Security-Policy starts in Report-Only: check nothing legitimate is blocked, then enforce it.', 'La Content-Security-Policy commence en Report-Only : vérifie que rien de légitime n’est bloqué, puis applique-la.')}
              </span>
            </div>
          )}
        </Card>

        {r.cookies.length > 0 && (
          <Card title="Cookies">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-faint">
                  <th className="px-3 py-2 text-left font-normal" />
                  <th className="px-2 py-2 font-normal">Secure</th>
                  <th className="px-2 py-2 font-normal">HttpOnly</th>
                  <th className="px-2 py-2 font-normal">SameSite</th>
                </tr>
              </thead>
              <tbody>
                {r.cookies.map((c) => (
                  <tr key={c.name}>
                    <td className="border-t border-line-soft px-3 py-2 font-mono text-[11.5px]">
                      {c.name}
                      {c.session && <span className="ml-2 text-[10.5px] text-faint">{t('session', 'session')}</span>}
                    </td>
                    <td className={`border-t border-line-soft px-2 py-2 text-center ${c.secure ? 'text-ok' : 'text-warn'}`}>{c.secure ? '✓' : '—'}</td>
                    <td className={`border-t border-line-soft px-2 py-2 text-center ${c.httpOnly ? 'text-ok' : c.session ? 'text-err' : 'text-ghost'}`}>{c.httpOnly ? '✓' : '—'}</td>
                    <td className={`border-t border-line-soft px-2 py-2 text-center ${c.sameSite ? 'text-ok' : 'text-warn'}`}>{c.sameSite ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {(r.mixedContent.length > 0 || r.insecureForms.length > 0) && (
          <Card title={t('Insecure requests', 'Requêtes non chiffrées')}>
            <ul className="m-0 list-none p-0">
              {[...r.insecureForms, ...r.mixedContent].map((m) => (
                <li key={m} className={`border-t border-line-soft px-3 py-2 first:border-t-0 ${mono} text-muted`}>
                  {m}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {r.thirdParty.length > 0 && (
          <Card title={t('Third-party scripts', 'Scripts tiers')} aside={<span className="font-mono text-xs text-muted">{r.thirdParty.length}</span>}>
            <ul className="m-0 list-none p-0">
              {r.thirdParty.map((tp) => (
                <li key={tp.host} className="flex items-center gap-2 border-t border-line-soft px-3 py-2 first:border-t-0">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{tp.host}</span>
                  <span className="text-xs text-faint">{t(`${tp.scripts} script${tp.scripts > 1 ? 's' : ''}`, `${tp.scripts} script${tp.scripts > 1 ? 's' : ''}`)}</span>
                  {tp.withoutIntegrity.length > 0 && <span className="rounded bg-warn/15 px-1.5 text-[10.5px] text-warn">{t('no integrity', 'sans integrity')}</span>}
                </li>
              ))}
            </ul>
            {noSri.length > 0 && (
              <p className="m-0 border-t border-line-soft px-3 py-2.5 text-xs text-muted">
                {t('Add integrity="sha384-…" crossorigin="anonymous" to scripts from public CDNs, or host them yourself.', 'Ajoute integrity="sha384-…" crossorigin="anonymous" aux scripts de CDN publics, ou héberge-les toi-même.')}
              </p>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
