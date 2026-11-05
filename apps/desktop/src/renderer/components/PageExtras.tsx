import { DEFAULT_BUDGET, budgetMetricLabel, formatBudgetValue, richKindLabel, t, type Budget } from '@kinglet/core';
import { activeProject, patchProject } from '../../shared/projects';
import { useStore } from '../store';
import { Dot, Icon } from './Icons';
import { CopyButton, SLASH } from './Mcp';

const card = 'h-fit shrink-0 overflow-hidden rounded-[10px] border border-line bg-card';
const IMPACT: Record<string, string> = { critical: 'bg-err', serious: 'bg-err', moderate: 'bg-warn', minor: 'bg-warn' };

/** axe-core violations, element by element, with the rule's documentation. */
export function A11yDetails() {
  const s = useStore();
  const a = s.report?.a11y;
  if (!a) return null;
  const impact = (i: string) => ({ critical: t('critical', 'critique'), serious: t('serious', 'grave'), moderate: t('moderate', 'modéré'), minor: t('minor', 'mineur') })[i] ?? i;
  const ask = () =>
    s.askClaude(
      t(`Fix these accessibility problems on ${s.url}:`, `Corrige ces problèmes d’accessibilité sur ${s.url} :`),
      [
        {
          kind: 'context',
          label: 'axe-core',
          text: [...a.violations.map((v) => `- [${v.impact}] ${v.id}: ${v.help} — ${v.targets.join(', ')} (${v.helpUrl})`), ...(a.focus?.count ? [`- No visible keyboard focus on ${a.focus.count} elements: ${a.focus.examples.join(', ')}`] : [])].join('\n'),
        },
      ],
    );
  const count = a.violations.length + (a.focus?.count ? 1 : 0);
  return (
    <section aria-label={t('Accessibility details', 'Détails d’accessibilité')} className={card}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="font-semibold">{t('Accessibility · details', 'Accessibilité · détails')}</span>
        <span className="flex items-center gap-2">
          {count > 0 && s.settings.claudePanel && (
            <button onClick={ask} className="h-6 rounded-md border border-[rgba(217,119,87,0.3)] px-2 text-[11px] font-medium text-[#d97757] hover:bg-[rgba(217,119,87,0.1)]">
              Claude
            </button>
          )}
          {count > 0 && <CopyButton text={SLASH.a11y} label={SLASH.a11y} done={t('Copied ✓', 'Copié ✓')} className="text-[11px]" />}
        </span>
      </div>
      <ul className="m-0 list-none border-t border-line-soft p-0">
        {!count && (
          <li className="flex gap-2.5 px-3 py-2.5 text-xs text-muted">
            <Dot className="mt-1.5 bg-ok" />
            {t('axe-core finds nothing and every element shows the keyboard focus.', 'axe-core ne trouve rien et chaque élément montre le focus clavier.')}
          </li>
        )}
        {a.violations.map((v) => (
          <li key={v.id} className="flex gap-2.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
            <Dot className={`mt-1.5 ${IMPACT[v.impact] ?? 'bg-warn'}`} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-fg">
                {v.help} <span className="text-faint">· {impact(v.impact)} · {v.nodes} {t(v.nodes > 1 ? 'elements' : 'element', v.nodes > 1 ? 'éléments' : 'élément')}</span>
              </span>
              {v.targets.map((x) => (
                <span key={x} className="truncate font-mono text-[10.5px] text-muted">
                  {x}
                </span>
              ))}
              <span className="text-[10.5px] text-ghost">
                {v.devices.join(', ')} ·{' '}
                <button onClick={() => window.kinglet.openExternal(v.helpUrl)} className="hover:text-fg hover:underline">
                  {v.id}
                </button>
              </span>
            </div>
          </li>
        ))}
        {a.focus && a.focus.count > 0 && (
          <li className="flex gap-2.5 border-t border-line-soft px-3 py-2.5">
            <Dot className="mt-1.5 bg-warn" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-fg">{t(`No visible focus on ${a.focus.count} of ${a.focus.total} elements`, `Pas de focus visible sur ${a.focus.count} éléments sur ${a.focus.total}`)}</span>
              <span className="text-[11px] text-muted">{a.focus.examples.join(', ')}</span>
              <button onClick={() => { s.setSection('apercu'); s.toggleTabOrder(true); }} className="flex items-center gap-1 self-start text-[11px] text-local hover:underline">
                <Icon name="tab" size={11} />
                {t('See the keyboard tour on the devices', 'Voir le parcours au clavier sur les appareils')}
              </button>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Performance budgets of the project: edited here, checked on every page and on each deployment. */
export function BudgetsCard() {
  const s = useStore();
  const project = activeProject(s.settings);
  if (!project) return null;
  const budgets = project.budgets ?? [];
  const results = s.report?.budgets ?? [];
  const save = (next: Budget[]) => void s.updateSettings(patchProject(s.settings, project.id, { budgets: next }));
  const patch = (id: string, p: Partial<Budget>) => save(budgets.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const field = 'h-7 w-full min-w-0 rounded-md border border-line bg-bg px-1.5 font-mono text-[11.5px] text-fg outline-none focus:border-line-strong';
  const failed = results.filter((r) => !r.ok);
  return (
    <section aria-label={t('Budgets', 'Budgets')} className={card}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="font-semibold">{t('Performance budgets', 'Budgets de performance')}</span>
        <span className={`font-mono text-xs ${failed.length ? 'text-err' : results.length ? 'text-ok' : 'text-muted'}`}>
          {results.length ? (failed.length ? t(`${failed.length} exceeded`, `${failed.length} dépassé${failed.length > 1 ? 's' : ''}`) : t('all met', 'tous tenus')) : t(`${budgets.length} set`, `${budgets.length} défini${budgets.length > 1 ? 's' : ''}`)}
        </span>
      </div>
      <div className="flex flex-col gap-2 border-t border-line-soft px-3 py-2.5">
        {results.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {results.map((r) => (
              <li key={`${r.budgetId}-${r.metric}`} className="flex items-center gap-2 text-xs">
                <Dot className={r.value == null ? 'bg-ghost' : r.ok ? 'bg-ok' : 'bg-err'} />
                <span className="w-20 shrink-0 text-muted">{budgetMetricLabel(r.metric)}</span>
                <span className={`font-mono ${r.ok ? 'text-fg' : 'text-err'}`}>{r.value == null ? t('not measured', 'non mesuré') : formatBudgetValue(r.metric, r.value)}</span>
                <span className="font-mono text-faint">/ {formatBudgetValue(r.metric, r.limit)}</span>
                {r.device && <span className="truncate text-[11px] text-ghost">{r.device}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_24px] items-end gap-1.5 text-[10.5px] text-faint">
          <span>{t('Pages', 'Pages')}</span>
          <span>{t('Weight KB', 'Poids Ko')}</span>
          <span>LCP ms</span>
          <span>CLS</span>
          <span>{t('Requests', 'Requêtes')}</span>
          <span />
          {budgets.map((b) => (
            <div key={b.id} className="contents">
              <input aria-label={t('Pages (path, * allowed)', 'Pages (chemin, * accepté)')} defaultValue={b.path} onBlur={(e) => patch(b.id, { path: e.target.value.trim() || '/' })} className={field} />
              <input aria-label={t('Max weight', 'Poids max')} inputMode="numeric" defaultValue={b.maxKb ?? ''} onBlur={(e) => patch(b.id, { maxKb: num(e.target.value) })} className={field} />
              <input aria-label="LCP max" inputMode="numeric" defaultValue={b.lcpMs ?? ''} onBlur={(e) => patch(b.id, { lcpMs: num(e.target.value) })} className={field} />
              <input aria-label="CLS max" inputMode="decimal" defaultValue={b.cls ?? ''} onBlur={(e) => patch(b.id, { cls: num(e.target.value) })} className={field} />
              <input aria-label={t('Max requests', 'Requêtes max')} inputMode="numeric" defaultValue={b.maxRequests ?? ''} onBlur={(e) => patch(b.id, { maxRequests: num(e.target.value) })} className={field} />
              <button onClick={() => save(budgets.filter((x) => x.id !== b.id))} aria-label={t('Delete this budget', 'Supprimer ce budget')} className="flex size-6 items-center justify-center rounded text-ghost hover:text-err">
                <Icon name="close" size={10} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => save([...budgets, DEFAULT_BUDGET()])} className="flex h-7 items-center gap-1.5 self-start rounded-md border border-line px-2 text-xs text-muted hover:border-line-strong hover:text-fg">
          <Icon name="plus" size={11} />
          {budgets.length ? t('Add a budget', 'Ajouter un budget') : t('Home page under 500 KB and LCP under 2.5 s', 'Accueil sous 500 Ko et LCP sous 2,5 s')}
        </button>
        <p className="m-0 text-[11px] leading-snug text-faint">
          {t(
            'Measured on the devices shown (worst one), with the throttling chosen. With Vercel, each new deployment is measured on a phone and a notification says when a budget is exceeded.',
            'Mesuré sur les appareils affichés (le pire), avec le ralentissement choisi. Avec Vercel, chaque nouveau déploiement est mesuré sur un téléphone et une notification prévient quand un budget est dépassé.',
          )}
        </p>
      </div>
    </section>
  );
}

/** JSON-LD of the page: each item, what Google requires and recommends. */
export function StructuredDataCard() {
  const sd = useStore((s) => s.report?.structured);
  if (!sd) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{t('Structured data', 'Données structurées')}</span>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        {!sd.items.length && !sd.errors.length && <p className="m-0 px-3 py-2.5 text-xs text-muted">{t('No JSON-LD: Google shows a plain result.', 'Pas de JSON-LD : Google affiche un résultat simple.')}</p>}
        {sd.errors.map((e) => (
          <div key={e} className="flex gap-2.5 border-t border-line-soft px-3 py-2 first:border-t-0">
            <Dot className="mt-1.5 bg-err" />
            <span className="text-xs text-err">{t('Invalid JSON-LD:', 'JSON-LD invalide :')} {e}</span>
          </div>
        ))}
        {sd.items.map((i, n) => (
          <div key={n} className="flex gap-2.5 border-t border-line-soft px-3 py-2 first:border-t-0">
            <Dot className={`mt-1.5 ${i.missing.length ? 'bg-err' : i.recommended.length ? 'bg-warn' : 'bg-ok'}`} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs">
                <span className="font-mono">{i.type}</span> <span className="text-faint">· {richKindLabel(i.kind)}</span>
                {i.rich && <span className="ml-1.5 rounded border border-ok/40 px-1 text-[10px] text-ok">{t('rich result', 'résultat enrichi')}</span>}
              </span>
              {i.name && <span className="truncate text-[11.5px] text-muted">« {i.name} »</span>}
              {i.missing.length > 0 && <span className="text-[11.5px] text-err">{t('Missing:', 'Manque :')} {i.missing.join(', ')}</span>}
              {i.recommended.length > 0 && <span className="text-[11.5px] text-warn">{t('Recommended:', 'Conseillé :')} {i.recommended.join(', ')}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** hreflang alternates: does each one answer, and link back? */
export function HreflangCard() {
  const share = useStore((s) => s.share);
  const h = useStore((s) => s.report?.hreflang);
  const list = share?.meta.hreflang ?? [];
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="label">hreflang</span>
      <div className="overflow-hidden rounded-[10px] border border-line bg-card">
        {(h?.alternates ?? list.map((x) => ({ ...x, status: null, returns: null, canonicalSelf: null }))).map((a) => (
          <div key={`${a.lang}-${a.href}`} className="flex items-center gap-2.5 border-t border-line-soft px-3 py-1.5 first:border-t-0">
            <Dot className={a.returns === false || (a.status ?? 200) >= 400 ? 'bg-err' : a.returns ? 'bg-ok' : 'bg-ghost'} />
            <span className="w-16 shrink-0 font-mono text-[11.5px] text-fg">{a.lang}</span>
            <span className="min-w-0 truncate font-mono text-[11px] text-muted">{a.href}</span>
            <span className="ml-auto shrink-0 text-[10.5px] text-faint">{a.returns === false ? t('one-way', 'sens unique') : a.returns ? t('both ways', 'réciproque') : ''}</span>
          </div>
        ))}
        {h?.issues.map((i) => (
          <div key={i.message} className="flex gap-2.5 border-t border-line-soft px-3 py-1.5">
            <Dot className={`mt-1.5 ${i.severity === 'error' ? 'bg-err' : 'bg-warn'}`} />
            <span className="text-[11.5px] text-muted">{i.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
