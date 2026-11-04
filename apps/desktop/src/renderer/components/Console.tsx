import { consolePrompt, groupEntries, locale, t } from '@parakeet/core';
import { useState } from 'react';
import type { DeviceLog } from '../../shared/types';
import { activePresets, api, useStore } from '../store';
import { Icon } from './Icons';

type Filter = 'problems' | 'errors' | 'all';

const DOT: Record<DeviceLog['level'], string> = { error: 'bg-err', warning: 'bg-warn', info: 'bg-ghost', debug: 'bg-ghost' };

const shortUrl = (u: string | undefined, origin: string | null) => {
  if (!u) return '';
  if (origin && u.startsWith(origin)) return u.slice(origin.length) || '/';
  return u.replace(/^https?:\/\//, '');
};

export const isProblem = (l: DeviceLog) => l.level === 'error' || l.level === 'warning';

/** Description of the throttling in use, for Claude ("slow 3G, CPU ×4"). */
export function throttleLabel(th: { network: string; cpu: number }) {
  const parts = [th.network === '3g' ? t('slow 3G', '3G lente') : th.network === '4g' ? t('slow 4G', '4G lente') : null, th.cpu > 1 ? `CPU ×${th.cpu}` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Live console and network errors of every device, with "Send to Claude". */
export function ConsoleTab() {
  const s = useStore();
  const { logs, url, consoleDevice, settings } = s;
  const devices = activePresets(s);
  const [filter, setFilter] = useState<Filter>('problems');
  const [copied, setCopied] = useState(false);
  let origin: string | null = null;
  try {
    origin = url ? new URL(url).origin : null;
  } catch {
    /* none */
  }
  const label = (id: string) => devices.find((d) => d.id === id)?.label ?? id;
  const ofDevice = logs.filter((l) => !consoleDevice || l.deviceId === consoleDevice);
  const shown = ofDevice.filter((l) => (filter === 'all' ? true : filter === 'errors' ? l.level === 'error' : isProblem(l)));
  const groups = groupEntries(shown).reverse(); // newest first
  const problems = ofDevice.filter(isProblem);

  const send = () => {
    const labels = Object.fromEntries(devices.map((d) => [d.id, d.label]));
    api().copy(consolePrompt(problems, { pageUrl: url, labels, throttled: throttleLabel(settings.throttle) }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const chip = (on: boolean) => `inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] whitespace-nowrap ${on ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_#2e2e33]' : 'text-faint hover:text-fg'}`;
  const count = (id: string | null) => logs.filter((l) => (!id || l.deviceId === id) && l.level === 'error').length;

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] flex-col">
      <div className="flex flex-col gap-2 border-b border-line-soft px-3 py-2.5">
        <div role="group" aria-label={t('Device', 'Appareil')} className="flex flex-wrap gap-1">
          {[null, ...devices.map((d) => d.id)].map((id) => {
            const n = count(id);
            return (
              <button key={id ?? 'all'} aria-pressed={consoleDevice === id} onClick={() => useStore.setState({ consoleDevice: id })} className={chip(consoleDevice === id)}>
                {id ? label(id) : t('All devices', 'Tous')}
                {n > 0 && <span className="font-mono text-[10.5px] text-err">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <div role="group" aria-label={t('Level', 'Niveau')} className="flex gap-1">
            {(
              [
                ['problems', t('Errors & warnings', 'Erreurs et avert.')],
                ['errors', t('Errors', 'Erreurs')],
                ['all', t('All', 'Tout')],
              ] as const
            ).map(([id, text]) => (
              <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={chip(filter === id)}>
                {text}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button
            onClick={send}
            disabled={!problems.length}
            title={t('Copies the errors and what to do, ready to paste into Claude Code', 'Copie les erreurs et quoi faire, prêt à coller dans Claude Code')}
            className="inline-flex h-6 items-center gap-1.5 rounded-md bg-fg px-2 text-[11.5px] font-semibold whitespace-nowrap text-bg disabled:bg-raised disabled:font-medium disabled:text-ghost"
          >
            {copied ? t('Copied ✓', 'Copié ✓') : t('Send to Claude', 'Envoyer à Claude')}
          </button>
        </div>
        {copied && <p className="m-0 text-[11.5px] text-muted">{t('Paste it into Claude Code (or run /mcp__parakeet__fix_console).', 'Colle-le dans Claude Code (ou lance /mcp__parakeet__fix_console).')}</p>}
      </div>
      <ul aria-label={t('Console', 'Console')} aria-live="polite" className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 font-mono text-[11.5px]">
        {groups.map(({ entry: l, devices: ids, count: n }) => (
          <li key={l.id} className="flex gap-2 border-b border-line-soft px-3 py-2">
            <span aria-hidden="true" className={`mt-[5px] size-1.5 shrink-0 rounded-full ${DOT[l.level]}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`break-words whitespace-pre-wrap ${l.level === 'error' ? 'text-err' : l.level === 'warning' ? 'text-warn' : 'text-muted'}`}>
                {l.source === 'network' && <span className="mr-1.5 text-faint">{l.method ?? 'GET'}</span>}
                {l.source === 'network' ? `${shortUrl(l.url, origin)} → ${l.text}` : l.text.length > 600 ? `${l.text.slice(0, 600)}…` : l.text}
              </span>
              <span className="flex flex-wrap gap-x-2 font-sans text-[11px] text-ghost">
                <span>{ids.map(label).join(', ')}</span>
                {l.source === 'console' && l.url && (
                  <span className="truncate">
                    {shortUrl(l.url, origin)}
                    {l.line ? `:${l.line}` : ''}
                  </span>
                )}
                {l.source === 'network' && <span>{l.resourceType ? `${t('network', 'réseau')} · ${l.resourceType.toLowerCase()}` : t('network', 'réseau')}</span>}
                {n > ids.length && <span>×{n}</span>}
                <span className="ml-auto">{new Date(l.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </span>
            </div>
          </li>
        ))}
        {!groups.length && (
          <li className="flex items-center gap-2 px-3 py-4 font-sans text-xs text-faint">
            <Icon name="check" size={13} className="text-ok" />
            {filter === 'all' ? t('Nothing logged since the page loaded.', 'Rien depuis le chargement de la page.') : t('No errors since the page loaded.', 'Aucune erreur depuis le chargement de la page.')}
          </li>
        )}
      </ul>
    </div>
  );
}
