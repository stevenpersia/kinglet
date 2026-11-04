import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  buildShareFix,
  consolePrompt,
  formatEntries,
  ago,
  t,
  crawl,
  PLATFORMS,
  probeImage,
  readPageMeta,
  readSharePreviews,
  readSiteFiles,
  runChecks,
  score,
  type CheckResult,
  type Platform,
} from '@parakeet/core';
import { z } from 'zod';
import { AppControl } from './control.ts';

export const SERVER_NAME = 'parakeet';

interface Options {
  /** Where to look for the running app (tests). */
  configDir?: string;
  version?: string;
}

/** Vercel Deployment Protection bypass, same variable as the app. */
function headersFor(url: string): Record<string, string> {
  const secret = process.env.PARAKEET_VERCEL_BYPASS;
  try {
    if (secret && new URL(url).hostname.endsWith('.vercel.app')) return { 'x-vercel-protection-bypass': secret };
  } catch {
    /* invalid URL */
  }
  return {};
}

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });
const fail = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }], isError: true });

/** A function: the language is read when the message is shown. */
const appClosed = () =>
  t(
    'The Parakeet app is not open: launch it (with the site in development) for screenshots and measures in the devices. The other tools work without it if you pass a URL.',
    'L’app Parakeet n’est pas ouverte : lance-la (avec le site en cours de dev) pour les captures et les mesures dans les appareils. Les autres outils marchent sans elle si tu passes une URL.',
  );

const ICON: Record<string, string> = { ok: '✓', info: 'ℹ', warning: '⚠', error: '✗', skip: '·' };

/** ": " in English, " : " in French. */
const sep = () => t(': ', ' : ');

function formatChecks(url: string, checks: CheckResult[], rendered: boolean) {
  const s = score(checks);
  const bad = checks.filter((c) => c.status === 'error' || c.status === 'warning');
  const lines = [
    t(
      `Checks for ${url}: ${s.passed}/${s.total}${rendered ? '' : ' (without measures in the devices: open Parakeet for overflow, JS errors and image weight)'}`,
      `Checks pour ${url} : ${s.passed}/${s.total}${rendered ? '' : ' (sans mesures dans les appareils : ouvre Parakeet pour le débordement, les erreurs JS et le poids des images)'}`,
    ),
    '',
    bad.length ? t('To fix:', 'À corriger :') : t('Nothing to fix.', 'Rien à corriger.'),
    ...bad.map((c) => `${ICON[c.status]} [${c.group}] ${c.label}${sep()}${c.detail}`),
    '',
    t('All:', 'Tout :'),
    ...checks.map((c) => `${ICON[c.status]} ${c.id}${sep()}${c.detail}`),
  ];
  return lines.join('\n');
}

export function createParakeetServer(opts: Options = {}) {
  const server = new McpServer({ name: SERVER_NAME, version: opts.version ?? '0.0.1' });
  const app = () => AppControl.connect(opts.configDir);

  /** The URL to work on: the one given, else the page open in the app. */
  async function resolveUrl(url: string | undefined): Promise<{ url: string; app: AppControl | null } | { error: string }> {
    const control = await app();
    if (url) return { url, app: control };
    if (!control) {
      const closed = appClosed();
      return { error: t(`No URL given and ${closed.charAt(0).toLowerCase()}${closed.slice(1)}`, `Aucune URL donnée et ${closed.charAt(0).toLowerCase()}${closed.slice(1)}`) };
    }
    const status = await control.status();
    if (!status.url) return { error: t('Parakeet is open but shows no site. Pass a URL or use open_url.', 'Parakeet est ouvert mais n’affiche aucun site. Passe une URL ou utilise open_url.') };
    return { url: status.url, app: control };
  }

  /** Short description of the arguments of a call, for the activity panel. */
  const summarize = (args: unknown) => {
    const values = Object.values((args ?? {}) as Record<string, unknown>).filter((v) => v !== undefined && v !== '');
    return values.length ? values.map((v) => (Array.isArray(v) ? v.join(', ') : String(v))).join(' · ') : t('open page', 'page ouverte');
  };

  /** Run a call and report it once to the app (its MCP activity panel). Reporting never fails the call. */
  async function tracked<T>(name: string, args: unknown, run: () => Promise<T>, isError: (r: T) => boolean): Promise<T> {
    const started = Date.now();
    let ok = false;
    try {
      const result = await run();
      ok = !isError(result);
      return result;
    } finally {
      const control = await app();
      await control?.report({ tool: name, ok, detail: summarize(args), ms: Date.now() - started }).catch(() => undefined);
    }
  }

  // Every tool and prompt registered below is tracked.
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: never, cb: (args: unknown, extra: unknown) => Promise<CallToolResult>) =>
    registerTool(name, config, ((args: unknown, extra: unknown) =>
      tracked(name, args, () => cb(args, extra).catch((e: Error) => fail(t(`Error: ${e.message}`, `Erreur : ${e.message}`))), (r) => !!r.isError)) as never)) as typeof server.registerTool;
  const registerPrompt = server.registerPrompt.bind(server);
  server.registerPrompt = ((name: string, config: never, cb: (args: unknown, extra: unknown) => Promise<unknown>) =>
    registerPrompt(name, config, ((args: unknown, extra: unknown) => tracked(`/${name}`, args, () => cb(args, extra), () => false)) as never)) as typeof server.registerPrompt;

  const urlArg = z.string().url().optional().describe(t('Page URL. Default: the page open in Parakeet.', 'URL de la page. Par défaut : la page ouverte dans Parakeet.'));

  server.registerTool(
    'status',
    {
      title: t('Parakeet status', 'État de Parakeet'),
      description: t('Tells whether the Parakeet app is open, the page shown and the emulated devices.', 'Indique si l’app Parakeet est ouverte, la page affichée et les appareils émulés.'),
      inputSchema: {},
    },
    async () => {
      const control = await app();
      if (!control) return text(appClosed());
      const s = await control.status();
      return text(
        [
          t(`Parakeet ${s.version} open.`, `Parakeet ${s.version} ouvert.`),
          `Page${sep()}${s.url ?? t('none', 'aucune')}`,
          `${t('Devices', 'Appareils')}${sep()}${s.devices.map((d) => `${d.label} (${d.id}, ${d.width}×${d.height})`).join(', ')}`,
        ].join('\n'),
      );
    },
  );

  server.registerTool(
    'open_url',
    {
      title: t('Open a page in Parakeet', 'Ouvrir une page dans Parakeet'),
      description: t('Shows a URL on all of Parakeet’s devices (local, preview or production).', 'Affiche une URL sur tous les appareils de Parakeet (local, preview ou prod).'),
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      const control = await app();
      if (!control) return fail(appClosed());
      const s = await control.navigate(url);
      return text(t(`Opened on ${s.devices.map((d) => d.label).join(', ')}: ${s.url}`, `Ouvert sur ${s.devices.map((d) => d.label).join(', ')} : ${s.url}`));
    },
  );

  server.registerTool(
    'set_devices',
    {
      title: t('Choose devices', 'Choisir les appareils'),
      description: t(
        'Changes the devices emulated in Parakeet. Ids: iphone-se, iphone-16, iphone-16-pro-max, pixel-9, galaxy-s24, ipad-mini, ipad-air, ipad-pro-13, laptop, desktop.',
        'Change les appareils émulés dans Parakeet. Ids : iphone-se, iphone-16, iphone-16-pro-max, pixel-9, galaxy-s24, ipad-mini, ipad-air, ipad-pro-13, laptop, desktop.',
      ),
      inputSchema: { ids: z.array(z.string()).min(1) },
    },
    async ({ ids }) => {
      const control = await app();
      if (!control) return fail(appClosed());
      const s = await control.setDevices(ids);
      return text(`${t('Devices', 'Appareils')}${sep()}${s.devices.map((d) => d.label).join(', ')}`);
    },
  );

  server.registerTool(
    'screenshot',
    {
      title: t('Device screenshots', 'Capture des appareils'),
      description: t(
        'Captures what each emulated device (or a single one) shows: use it to check a fix visually on phone and tablet.',
        'Capture ce qu’affiche chaque appareil émulé (ou un seul) : à utiliser pour vérifier visuellement une correction sur mobile et tablette.',
      ),
      inputSchema: {
        device: z.string().optional().describe(t('Device id (e.g. iphone-16). Default: all.', 'Id d’un appareil (ex. iphone-16). Par défaut : tous.')),
        url: z.string().url().optional().describe(t('Opens this URL before the screenshot.', 'Ouvre cette URL avant la capture.')),
      },
    },
    async ({ device, url }) => {
      const control = await app();
      if (!control) return fail(appClosed());
      if (url) await control.navigate(url);
      const { shots } = await control.screenshot(device ?? null);
      if (!shots.length) return fail(device ? t(`No device “${device}” in Parakeet.`, `Aucun appareil « ${device} » dans Parakeet.`) : t('No device to capture.', 'Aucun appareil à capturer.'));
      return {
        content: shots.flatMap((s) => [
          { type: 'text' as const, text: `${s.label} (${s.width}×${s.height})` },
          { type: 'image' as const, data: s.data, mimeType: s.mime },
        ]),
      };
    },
  );

  server.registerTool(
    'list_deployments',
    {
      title: t('Vercel deployments', 'Déploiements Vercel'),
      description: t(
        'Lists the Vercel deployments of the project linked in Parakeet (production and previews), with their state, branch, commit and URL. Useful to open a preview with open_url or to check that a build passed.',
        'Liste les déploiements Vercel du projet lié dans Parakeet (production et previews), avec leur état, branche, commit et URL. Utile pour ouvrir une preview avec open_url ou vérifier qu’un build est passé.',
      ),
      inputSchema: {},
    },
    async () => {
      const control = await app();
      if (!control) return fail(appClosed());
      const { project, deployments } = await control.deployments();
      if (!project) return fail(t('No linked Vercel project: connect Vercel in Parakeet’s settings.', 'Aucun projet Vercel lié : connecte Vercel dans les réglages de Parakeet.'));
      return text(
        [
          `${t('Project', 'Projet')} ${project.name}${project.productionUrl ? ` · production${sep()}${project.productionUrl}` : ''}`,
          '',
          ...deployments.map((d) => `${d.state.padEnd(8)} ${d.production ? 'PROD   ' : 'preview'} ${d.branch ?? '—'} · ${d.commitMessage ?? ''} · ${d.author ?? ''} · ${ago(d.createdAt)}\n         ${d.url}`),
        ].join('\n'),
      );
    },
  );

  server.registerTool(
    'get_console',
    {
      title: t('Device console', 'Console des appareils'),
      description: t(
        'Console messages (errors, warnings) and network errors (failed requests, HTTP 4xx/5xx) of each emulated device in Parakeet, since the page was last loaded. Needs the app open.',
        'Messages de console (erreurs, avertissements) et erreurs réseau (requêtes échouées, HTTP 4xx/5xx) de chaque appareil émulé dans Parakeet, depuis le dernier chargement de la page. Nécessite l’app ouverte.',
      ),
      inputSchema: { all: z.boolean().optional().describe(t('Include info and debug messages too', 'Inclure aussi les messages info et debug')) },
    },
    async ({ all }) => {
      const control = await app();
      if (!control) return fail(appClosed());
      const { url, logs, throttle } = await control.logs();
      const kept = all ? logs : logs.filter((l) => l.level === 'error' || l.level === 'warning');
      if (!kept.length) return text(t(`Console clean on ${url ?? 'the page'}: no errors or warnings.`, `Console propre sur ${url ?? 'la page'} : aucune erreur ni avertissement.`));
      const slow = throttle.network !== 'off' || throttle.cpu > 1 ? ` · ${t('throttled', 'ralenti')} : ${throttle.network}, CPU ×${throttle.cpu}` : '';
      return text([`${url ?? ''}${slow}`, '', ...formatEntries(kept, { pageUrl: url })].join('\n'));
    },
  );

  server.registerTool(
    'get_page_meta',
    {
      title: t('Page tags', 'Balises de la page'),
      description: t(
        'Reads the page like a share bot (raw HTML, no JavaScript): title, description, Open Graph, Twitter, viewport, lang, canonical, icons.',
        'Lit la page comme un robot de partage (HTML brut, sans JavaScript) : title, description, Open Graph, Twitter, viewport, lang, canonical, icônes.',
      ),
      inputSchema: { url: urlArg },
    },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return fail(r.error);
      const m = await readPageMeta(r.url, { headers: headersFor(r.url) });
      const pick = { url: m.finalUrl, status: m.status, framework: m.framework, title: m.title, description: m.description, lang: m.lang, viewport: m.viewport, canonical: m.canonical, themeColor: m.themeColor, og: m.og, twitter: m.twitter, icons: m.icons, manifest: m.manifest, robots: m.robotsMeta ?? m.robotsHeader };
      return text(JSON.stringify(pick, null, 2));
    },
  );

  server.registerTool(
    'get_share_preview',
    {
      title: t('Share previews', 'Aperçus de partage'),
      description: t(
        'Simulates the link preview on WhatsApp, iMessage, Slack, Discord, LinkedIn, X and Google (each bot reads the page), lists the problems and suggests the fix for the site’s framework.',
        'Simule l’aperçu du lien sur WhatsApp, iMessage, Slack, Discord, LinkedIn, X et Google (chaque robot lit la page), liste les problèmes et propose le correctif pour le framework du site.',
      ),
      inputSchema: { url: urlArg, platform: z.enum(PLATFORMS.map((p) => p.id) as [Platform, ...Platform[]]).optional() },
    },
    async ({ url, platform }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return fail(r.error);
      const previews = await readSharePreviews(r.url, { headers: headersFor(r.url) });
      const fix = buildShareFix(previews.meta, previews.image);
      const cards = previews.cards.filter((c) => !platform || c.platform === platform);
      const lines = [
        t(`Share previews for ${r.url} (framework: ${fix.frameworkLabel})`, `Aperçus de partage pour ${r.url} (framework : ${fix.frameworkLabel})`),
        '',
        ...cards.map(
          (c) =>
            `${ICON[c.status]} ${c.label} [${c.layout}] ${t(`title “${c.title ?? '—'}”`, `titre « ${c.title ?? '—'} »`)}${c.image ? t(', with image', ', avec image') : t(', no image', ', sans image')}${c.problems.length ? `\n    ${c.problems.join('\n    ')}` : ''}`,
        ),
        '',
        fix.changes.length
          ? `${t(`Fix (${fix.file}):`, `Correctif (${fix.file}) :`)}\n${fix.changes.map((c) => `- ${c}`).join('\n')}\n\n\`\`\`${fix.language}\n${fix.code}\n\`\`\``
          : t('No fix needed.', 'Aucune correction nécessaire.'),
      ];
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'run_checks',
    {
      title: t('Run the 30 checks', 'Lancer les 30 checks'),
      description: t(
        'SEO, sharing, mobile and technical. With the app open, includes the measures in the devices (horizontal overflow, JavaScript errors, heavy images).',
        'SEO, partage, mobile et technique. Avec l’app ouverte, inclut les mesures dans les appareils (débordement horizontal, erreurs JavaScript, images lourdes).',
      ),
      inputSchema: { url: urlArg },
    },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return fail(r.error);
      if (r.app) {
        const report = await r.app.analyze<{ url: string; checks: CheckResult[] }>(r.url);
        return text(formatChecks(report.url, report.checks, true));
      }
      const headers = headersFor(r.url);
      const meta = await readPageMeta(r.url, { headers });
      const image = meta.ogImageUrl ? await probeImage(meta.ogImageUrl, { headers }) : null;
      const site = await readSiteFiles(meta.finalUrl, { manifest: meta.manifest, favicon: meta.icons[0] ?? null }, { headers }).catch(() => null);
      return text(formatChecks(meta.finalUrl, runChecks({ meta, image, site }), false));
    },
  );

  // Claude Code's --permission-prompt-tool: Parakeet's Claude panel asks before a command runs.
  server.registerTool(
    'approve',
    {
      title: t('Ask before a command', 'Demander avant une commande'),
      description: t(
        'Used by Claude Code inside Parakeet (permission prompt): asks the user in Parakeet whether a tool may run. Do not call it yourself.',
        'Utilisé par Claude Code dans Parakeet (demande de permission) : demande à l’utilisateur dans Parakeet si un outil peut s’exécuter. Ne l’appelle pas toi-même.',
      ),
      inputSchema: { tool_name: z.string(), input: z.record(z.string(), z.unknown()).optional(), tool_use_id: z.string().optional() },
    },
    async ({ tool_name, input }) => {
      const control = await app();
      const deny = (message: string) => text(JSON.stringify({ behavior: 'deny', message }));
      if (!control) return deny(appClosed());
      const r = await control.approve({ tool: tool_name, input: input ?? {}, chat: process.env.PARAKEET_CHAT_PROJECT ?? null });
      return r.allow ? text(JSON.stringify({ behavior: 'allow', updatedInput: input ?? {} })) : deny(r.message ?? t('The user refused.', 'L’utilisateur a refusé.'));
    },
  );

  server.registerTool(
    'list_pages',
    {
      title: t('Site pages', 'Pages du site'),
      description: t('Explores the site (links, sitemap) and lists its pages with their HTTP status and title.', 'Explore le site (liens, sitemap) et liste ses pages avec leur statut HTTP et leur titre.'),
      inputSchema: { url: urlArg },
    },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return fail(r.error);
      const pages = await crawl(r.url, { headers: headersFor(r.url), limit: 60 });
      return text(pages.map((p) => `${p.status ?? '—'}  ${p.path}${p.title ? `  ${t(`“${p.title}”`, `« ${p.title} »`)}` : ''}`).join('\n'));
    },
  );

  // Prompts become slash commands in Claude Code: /mcp__parakeet__fix_share, /mcp__parakeet__fix_checks
  server.registerPrompt(
    'fix_share',
    {
      title: t('Fix share previews', 'Corriger les aperçus de partage'),
      description: t('Fixes the share tags of the page open in Parakeet (or of the given URL), then checks.', 'Corrige les balises de partage de la page ouverte dans Parakeet (ou de l’URL donnée), puis vérifie.'),
      argsSchema: { url: z.string().optional() },
    },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return { messages: [{ role: 'user', content: { type: 'text', text: r.error } }] };
      const previews = await readSharePreviews(r.url, { headers: headersFor(r.url) });
      const fix = buildShareFix(previews.meta, previews.image);
      const body = fix.prompt
        ? `${fix.prompt}\n\n${t(`When done, call Parakeet’s get_share_preview tool on ${r.url} to check that the problems are gone.`, `Quand c’est fait, appelle l’outil get_share_preview de Parakeet sur ${r.url} pour vérifier que les problèmes ont disparu.`)}`
        : t(`The share tags of ${r.url} are already complete. Nothing to do.`, `Les balises de partage de ${r.url} sont déjà complètes. Rien à faire.`);
      return { messages: [{ role: 'user', content: { type: 'text', text: body } }] };
    },
  );

  server.registerPrompt(
    'fix_checks',
    {
      title: t('Fix the checks', 'Corriger les checks'),
      description: t('Fixes the problems found by the 30 checks on the page open in Parakeet, then runs the checks again.', 'Corrige les problèmes trouvés par les 30 checks sur la page ouverte dans Parakeet, puis relance les checks.'),
      argsSchema: { url: z.string().optional() },
    },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return { messages: [{ role: 'user', content: { type: 'text', text: r.error } }] };
      let checks: CheckResult[];
      if (r.app) checks = (await r.app.analyze<{ checks: CheckResult[] }>(r.url)).checks;
      else {
        const meta = await readPageMeta(r.url, { headers: headersFor(r.url) });
        checks = runChecks({ meta, image: meta.ogImageUrl ? await probeImage(meta.ogImageUrl) : null, site: null });
      }
      const bad = checks.filter((c) => c.status === 'error' || c.status === 'warning');
      const body = bad.length
        ? [
            t(`Parakeet found these problems on ${r.url}:`, `Parakeet a trouvé ces problèmes sur ${r.url} :`),
            ...bad.map((c) => `- [${c.status === 'error' ? t('problem', 'problème') : t('to improve', 'à améliorer')}] ${c.label}${sep()}${c.detail}`),
            '',
            t(
              'Fix them in the project’s code, without changing the design or the visible content. Start with the problems.',
              'Corrige-les dans le code du projet, sans changer le design ni le contenu visible. Commence par les problèmes.',
            ),
            t(
              'Then call run_checks to check, and screenshot if you touched the mobile layout.',
              'Ensuite appelle run_checks pour vérifier, et screenshot si tu as touché à la mise en page mobile.',
            ),
          ].join('\n')
        : t(`All checks pass on ${r.url}. Nothing to do.`, `Tous les checks passent sur ${r.url}. Rien à faire.`);
      return { messages: [{ role: 'user', content: { type: 'text', text: body } }] };
    },
  );

  server.registerPrompt(
    'fix_console',
    {
      title: t('Fix console errors', 'Corriger les erreurs de console'),
      description: t('Fixes the JavaScript and network errors seen in Parakeet’s devices on the open page, then checks the console again.', 'Corrige les erreurs JavaScript et réseau vues dans les appareils de Parakeet sur la page ouverte, puis revérifie la console.'),
      argsSchema: {},
    },
    async () => {
      const control = await app();
      if (!control) return { messages: [{ role: 'user', content: { type: 'text', text: appClosed() } }] };
      const { url, logs } = await control.logs();
      const body = consolePrompt(
        logs.filter((l) => l.level === 'error' || l.level === 'warning'),
        { pageUrl: url },
      );
      return { messages: [{ role: 'user', content: { type: 'text', text: body } }] };
    },
  );

  return server;
}
