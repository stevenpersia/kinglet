import { t } from '@parakeet/core';
import { useEffect } from 'react';
import { activePresets, useStore } from '../store';
import { Icon } from './Icons';

/** Inspector: the element hovered (or picked) on one device, as it is on every device. */
export function InspectBar() {
  const s = useStore();
  const { inspect, toggleInspect } = s;
  const devices = activePresets(s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && toggleInspect(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleInspect]);

  const ask = () => {
    if (!inspect) return;
    const lines = devices.map((d) => {
      const m = inspect.devices[d.id];
      if (!m) return `- ${d.label}: not on this device`;
      if (!m.shown) return `- ${d.label}: hidden (display ${m.display})`;
      return `- ${d.label}: ${m.width}×${m.height} at y=${m.y}, margin ${m.margin}, padding ${m.padding}, font ${m.font}, line-height ${m.lineHeight}, color ${m.color}`;
    });
    s.askClaude(t(`About this element (${inspect.selector}) on ${s.url ?? 'the page'}:`, `À propos de cet élément (${inspect.selector}) sur ${s.url ?? 'la page'} :`), [{ kind: 'context', label: t('inspected-element', 'element-inspecte'), text: [`Selector: ${inspect.selector}`, ...lines].join('\n') }]);
    toggleInspect(false);
  };

  const first = inspect ? Object.values(inspect.devices).find(Boolean) : null;
  return (
    <section aria-label={t('Inspector', 'Inspecteur')} className="flex max-h-[240px] shrink-0 flex-col border-t border-line-soft bg-chrome">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Icon name="target" size={13} className="shrink-0 text-local" />
        {inspect ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="font-mono text-xs text-fg">{first?.tag ?? '?'}</span>
            {first?.text && <span className="truncate text-xs text-muted">« {first.text} »</span>}
            <span className="truncate font-mono text-[10.5px] text-ghost">{inspect.selector}</span>
          </span>
        ) : (
          <span className="flex-1 text-xs text-muted">{t('Hover an element on a device: it lights up on all of them. Click to keep it.', 'Survole un élément sur un appareil : il s’allume sur tous. Clique pour le garder.')}</span>
        )}
        {inspect?.picked && <span className="shrink-0 text-[11px] text-[#d97757]">{t('kept · click again to release', 'gardé · reclique pour relâcher')}</span>}
        {inspect && s.settings.claudePanel && (
          <button onClick={ask} className="h-7 shrink-0 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-2.5 text-xs font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]">
            {t('Ask Claude', 'Demander à Claude')}
          </button>
        )}
        <button onClick={() => toggleInspect(false)} aria-label={t('Stop inspecting', 'Arrêter l’inspection')} title={t('Stop (Esc)', 'Arrêter (Échap)')} className="flex size-7 shrink-0 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
          <Icon name="close" size={11} />
        </button>
      </div>
      {inspect && (
        <div className="overflow-auto border-t border-line-soft">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="label">
                {[t('Device', 'Appareil'), t('Size', 'Taille'), 'Margin', 'Padding', t('Font', 'Police'), t('Color', 'Couleur')].map((h) => (
                  <th key={h} className="px-4 py-1.5 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-muted tabular-nums">
              {devices.map((d) => {
                const m = inspect.devices[d.id];
                return (
                  <tr key={d.id} className="border-t border-line-soft">
                    <td className="px-4 py-1.5 font-sans whitespace-nowrap text-fg">{d.label}</td>
                    {!m || !m.shown ? (
                      <td colSpan={5} className="px-4 py-1.5 font-sans text-warn">
                        {!m ? t('Not on this device', 'Absent sur cet appareil') : t(`Hidden (display: ${m.display})`, `Masqué (display : ${m.display})`)}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-1.5 whitespace-nowrap text-fg">
                          {m.width} × {m.height}
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap">{m.margin}</td>
                        <td className="px-4 py-1.5 whitespace-nowrap">{m.padding}</td>
                        <td className="px-4 py-1.5 whitespace-nowrap">{m.font}</td>
                        <td className="px-4 py-1.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className="size-2.5 rounded-sm border border-line-strong" style={{ background: m.color }} />
                            {m.color.replace(/^rgb\((.*)\)$/, '$1')}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
