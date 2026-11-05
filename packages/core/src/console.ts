import { t } from './i18n.ts';

/** A console message or a network error seen in an emulated device. */
export interface ConsoleEntry {
  deviceId: string;
  source: 'console' | 'network';
  level: 'error' | 'warning' | 'info' | 'debug';
  text: string;
  url?: string;
  line?: number;
  status?: number;
  method?: string;
  resourceType?: string;
}

const short = (u: string | undefined, origin: string | null) => (u && origin && u.startsWith(origin) ? u.slice(origin.length) || '/' : u);

/** Same message on several devices: one line, with the devices listed. */
export function groupEntries<T extends ConsoleEntry>(entries: T[]) {
  const groups = new Map<string, { entry: T; devices: string[]; count: number }>();
  for (const e of entries) {
    const key = `${e.source}|${e.level}|${e.text}|${e.url ?? ''}|${e.line ?? ''}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (!g.devices.includes(e.deviceId)) g.devices.push(e.deviceId);
    } else groups.set(key, { entry: e, devices: [e.deviceId], count: 1 });
  }
  return [...groups.values()];
}

/** One line per (grouped) entry, for Claude. */
export function formatEntries(entries: ConsoleEntry[], opts: { pageUrl: string | null; labels?: Record<string, string> }) {
  let origin: string | null = null;
  try {
    origin = opts.pageUrl ? new URL(opts.pageUrl).origin : null;
  } catch {
    /* no page */
  }
  const name = (id: string) => opts.labels?.[id] ?? id;
  return groupEntries(entries).map(({ entry: e, devices, count }) => {
    const where = e.source === 'network' ? `${e.method ?? 'GET'} ${short(e.url, origin)}` : e.url ? `${short(e.url, origin)}${e.line ? `:${e.line}` : ''}` : '';
    const tag = e.source === 'network' ? t('network', 'réseau') : e.level === 'error' ? t('error', 'erreur') : e.level === 'warning' ? 'warning' : 'log';
    return `- [${tag}] ${e.text}${where ? ` (${where})` : ''} · ${devices.map(name).join(', ')}${count > devices.length ? ` · ×${count}` : ''}`;
  });
}

/** What "Send to Claude" puts in the clipboard: the errors, where they happen, and what to do. */
export function consolePrompt(entries: ConsoleEntry[], opts: { pageUrl: string | null; labels?: Record<string, string>; throttled?: string | null }) {
  const lines = formatEntries(entries, opts);
  if (!lines.length) return t(`No errors in the console of ${opts.pageUrl ?? 'the page'}.`, `Aucune erreur dans la console de ${opts.pageUrl ?? 'la page'}.`);
  return [
    t(`Kinglet saw these errors on ${opts.pageUrl ?? 'the page'} (emulated devices${opts.throttled ? `, ${opts.throttled}` : ''}):`, `Kinglet a vu ces erreurs sur ${opts.pageUrl ?? 'la page'} (appareils émulés${opts.throttled ? `, ${opts.throttled}` : ''}) :`),
    ...lines,
    '',
    t(
      'Find the cause in the project’s code and fix it. If an error only happens on some devices, look at what differs (width, touch, user agent). Then reload the page in Kinglet and check the console is clean (the Kinglet MCP tool get_console reads it).',
      'Trouve la cause dans le code du projet et corrige-la. Si une erreur n’arrive que sur certains appareils, regarde ce qui diffère (largeur, tactile, user agent). Ensuite recharge la page dans Kinglet et vérifie que la console est propre (l’outil MCP get_console de Kinglet la lit).',
    ),
  ].join('\n');
}
