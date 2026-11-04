import { t } from '@parakeet/core';
import { useEffect } from 'react';
import type { ApiMock } from '../../shared/types';
import { api, useStore } from '../store';
import { Icon } from './Icons';

const field = 'h-7 min-w-0 rounded-md border border-line bg-bg px-2 font-mono text-[11.5px] text-fg outline-none focus:border-line-strong';

const PRESETS = (): { label: string; mock: Partial<ApiMock> }[] => [
  { label: t('Server error (500)', 'Erreur serveur (500)'), mock: { status: 500, body: '{"error":"Internal Server Error"}' } },
  { label: t('Not found (404)', 'Introuvable (404)'), mock: { status: 404, body: '{"error":"Not Found"}' } },
  { label: t('Empty list', 'Liste vide'), mock: { status: 200, body: '[]' } },
  { label: t('Slow (3 s)', 'Lente (3 s)'), mock: { status: 200, body: '{}', delayMs: 3000 } },
];

/** Simulated API responses: test error, empty and slow states without touching the backend. */
export function MocksDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useStore();
  const mocks = settings.mocks;
  const save = (next: ApiMock[]) => void updateSettings({ mocks: next });
  const patch = (id: string, p: Partial<ApiMock>) => save(mocks.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const add = (preset: Partial<ApiMock> = {}) =>
    save([...mocks, { id: `m${Date.now().toString(36)}`, enabled: true, method: '*', pattern: '*/api/*', status: 200, contentType: 'application/json', body: '{}', delayMs: 0, ...preset }]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('Simulated API responses', 'Réponses d’API simulées')} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-[720px] flex-col overflow-hidden rounded-[14px] border border-line bg-card shadow-2xl shadow-black/70">
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{t('Simulated API responses', 'Réponses d’API simulées')}</h2>
            <p className="m-0 text-xs text-muted">
              {t(
                'Requests whose URL matches get this answer instead of the real one, on every device. * matches anything. Reload to see the page with them.',
                'Les requêtes dont l’URL correspond reçoivent cette réponse à la place de la vraie, sur tous les appareils. * remplace n’importe quoi. Recharge pour voir la page avec.',
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
            <Icon name="close" size={12} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5 overflow-y-auto p-5">
          {!mocks.length && <p className="m-0 text-xs text-faint">{t('No simulated response yet.', 'Aucune réponse simulée pour l’instant.')}</p>}
          {mocks.map((m) => (
            <div key={m.id} className={`flex flex-col gap-2 rounded-[10px] border p-3 ${m.enabled ? 'border-line-strong bg-bg' : 'border-line bg-bg/50 opacity-70'}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={m.enabled} onChange={() => patch(m.id, { enabled: !m.enabled })} aria-label={t('On', 'Active')} className="size-[15px] accent-[#ededef]" />
                <select value={m.method} onChange={(e) => patch(m.id, { method: e.target.value })} aria-label={t('Method', 'Méthode')} className={`${field} w-20`}>
                  {['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => (
                    <option key={x} value={x}>
                      {x === '*' ? t('any', 'toutes') : x}
                    </option>
                  ))}
                </select>
                <input value={m.pattern} onChange={(e) => patch(m.id, { pattern: e.target.value })} aria-label={t('URL pattern', 'Motif d’URL')} placeholder="*/api/plans*" className={`${field} flex-1`} />
                <span className="text-[11px] text-faint">→</span>
                <input value={String(m.status)} onChange={(e) => patch(m.id, { status: Math.max(100, Math.min(599, Number(e.target.value) || 200)) })} aria-label="Status" inputMode="numeric" className={`${field} w-14`} />
                <input value={String(m.delayMs)} onChange={(e) => patch(m.id, { delayMs: Math.max(0, Number(e.target.value) || 0) })} aria-label={t('Delay (ms)', 'Délai (ms)')} title={t('Delay (ms)', 'Délai (ms)')} inputMode="numeric" className={`${field} w-16`} />
                <span className="text-[10.5px] text-ghost">ms</span>
                <button onClick={() => save(mocks.filter((x) => x.id !== m.id))} aria-label={t('Delete', 'Supprimer')} className="flex size-7 items-center justify-center rounded-md text-ghost hover:bg-active hover:text-err">
                  <Icon name="close" size={11} />
                </button>
              </div>
              <textarea value={m.body} onChange={(e) => patch(m.id, { body: e.target.value })} aria-label={t('Response body', 'Corps de la réponse')} rows={2} className="resize-y rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[11.5px] text-muted outline-none focus:border-line-strong" />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button onClick={() => add()} className="h-7 rounded-ui bg-fg px-3 text-xs font-semibold text-bg">
              {t('Add a response', 'Ajouter une réponse')}
            </button>
            {PRESETS().map((p) => (
              <button key={p.label} onClick={() => add(p.mock)} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium text-muted hover:border-line-strong hover:text-fg">
                {p.label}
              </button>
            ))}
            <span className="flex-1" />
            <button onClick={() => void api().reload()} className="h-7 rounded-ui border border-[#2a2a2f] bg-active px-2.5 text-xs font-medium hover:border-line-strong">
              <Icon name="reload" size={11} className="mr-1 inline" />
              {t('Reload devices', 'Recharger les appareils')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
