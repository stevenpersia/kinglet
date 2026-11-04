import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  buildShareFix,
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

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });
const fail = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }], isError: true });

const APP_CLOSED =
  'L’app Parakeet n’est pas ouverte : lance-la (avec le site en cours de dev) pour les captures et les mesures dans les appareils. Les autres outils marchent sans elle si tu passes une URL.';

const ICON: Record<string, string> = { ok: '✓', info: 'ℹ', warning: '⚠', error: '✗', skip: '·' };

function formatChecks(url: string, checks: CheckResult[], rendered: boolean) {
  const s = score(checks);
  const bad = checks.filter((c) => c.status === 'error' || c.status === 'warning');
  const lines = [
    `Checks pour ${url} : ${s.passed}/${s.total}${rendered ? '' : ' (sans mesures dans les appareils : ouvre Parakeet pour le débordement, les erreurs JS et le poids des images)'}`,
    '',
    bad.length ? 'À corriger :' : 'Rien à corriger.',
    ...bad.map((c) => `${ICON[c.status]} [${c.group}] ${c.label} : ${c.detail}`),
    '',
    'Tout :',
    ...checks.map((c) => `${ICON[c.status]} ${c.id} : ${c.detail}`),
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
    if (!control) return { error: `Aucune URL donnée et ${APP_CLOSED.charAt(0).toLowerCase()}${APP_CLOSED.slice(1)}` };
    const status = await control.status();
    if (!status.url) return { error: 'Parakeet est ouvert mais n’affiche aucun site. Passe une URL ou utilise open_url.' };
    return { url: status.url, app: control };
  }

  /** Short description of the arguments of a call, for the activity panel. */
  const summarize = (args: unknown) => {
    const values = Object.values((args ?? {}) as Record<string, unknown>).filter((v) => v !== undefined && v !== '');
    return values.length ? values.map((v) => (Array.isArray(v) ? v.join(', ') : String(v))).join(' · ') : 'page ouverte';
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
      tracked(name, args, () => cb(args, extra).catch((e: Error) => fail(`Erreur : ${e.message}`)), (r) => !!r.isError)) as never)) as typeof server.registerTool;
  const registerPrompt = server.registerPrompt.bind(server);
  server.registerPrompt = ((name: string, config: never, cb: (args: unknown, extra: unknown) => Promise<unknown>) =>
    registerPrompt(name, config, ((args: unknown, extra: unknown) => tracked(`/${name}`, args, () => cb(args, extra), () => false)) as never)) as typeof server.registerPrompt;

  const urlArg = z.string().url().optional().describe('URL de la page. Par défaut : la page ouverte dans Parakeet.');

  server.registerTool(
    'status',
    { title: 'État de Parakeet', description: 'Indique si l’app Parakeet est ouverte, la page affichée et les appareils émulés.', inputSchema: {} },
    async () => {
      const control = await app();
      if (!control) return text(APP_CLOSED);
      const s = await control.status();
      return text(
        [`Parakeet ${s.version} ouvert.`, `Page : ${s.url ?? 'aucune'}`, `Appareils : ${s.devices.map((d) => `${d.label} (${d.id}, ${d.width}×${d.height})`).join(', ')}`].join('\n'),
      );
    },
  );

  server.registerTool(
    'open_url',
    { title: 'Ouvrir une page dans Parakeet', description: 'Affiche une URL sur tous les appareils de Parakeet (local, preview ou prod).', inputSchema: { url: z.string().url() } },
    async ({ url }) => {
      const control = await app();
      if (!control) return fail(APP_CLOSED);
      const s = await control.navigate(url);
      return text(`Ouvert sur ${s.devices.map((d) => d.label).join(', ')} : ${s.url}`);
    },
  );

  server.registerTool(
    'set_devices',
    {
      title: 'Choisir les appareils',
      description: 'Change les appareils émulés dans Parakeet. Ids : iphone-se, iphone-16, iphone-16-pro-max, pixel-9, galaxy-s24, ipad-mini, ipad-air, ipad-pro-13, laptop, desktop.',
      inputSchema: { ids: z.array(z.string()).min(1) },
    },
    async ({ ids }) => {
      const control = await app();
      if (!control) return fail(APP_CLOSED);
      const s = await control.setDevices(ids);
      return text(`Appareils : ${s.devices.map((d) => d.label).join(', ')}`);
    },
  );

  server.registerTool(
    'screenshot',
    {
      title: 'Capture des appareils',
      description: 'Capture ce qu’affiche chaque appareil émulé (ou un seul) : à utiliser pour vérifier visuellement une correction sur mobile et tablette.',
      inputSchema: { device: z.string().optional().describe('Id d’un appareil (ex. iphone-16). Par défaut : tous.'), url: z.string().url().optional().describe('Ouvre cette URL avant la capture.') },
    },
    async ({ device, url }) => {
      const control = await app();
      if (!control) return fail(APP_CLOSED);
      if (url) await control.navigate(url);
      const { shots } = await control.screenshot(device ?? null);
      if (!shots.length) return fail(device ? `Aucun appareil « ${device} » dans Parakeet.` : 'Aucun appareil à capturer.');
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
      title: 'Déploiements Vercel',
      description: 'Liste les déploiements Vercel du projet lié dans Parakeet (production et previews), avec leur état, branche, commit et URL. Utile pour ouvrir une preview avec open_url ou vérifier qu’un build est passé.',
      inputSchema: {},
    },
    async () => {
      const control = await app();
      if (!control) return fail(APP_CLOSED);
      const { project, deployments } = await control.deployments();
      if (!project) return fail('Aucun projet Vercel lié : connecte Vercel dans les réglages de Parakeet.');
      const ago = (t: number) => {
        const m = Math.round((Date.now() - t) / 60_000);
        return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
      };
      return text(
        [
          `Projet ${project.name}${project.productionUrl ? ` · production : ${project.productionUrl}` : ''}`,
          '',
          ...deployments.map((d) => `${d.state.padEnd(8)} ${d.production ? 'PROD   ' : 'preview'} ${d.branch ?? '—'} · ${d.commitMessage ?? ''} · ${d.author ?? ''} · ${ago(d.createdAt)}\n         ${d.url}`),
        ].join('\n'),
      );
    },
  );

  server.registerTool(
    'get_page_meta',
    { title: 'Balises de la page', description: 'Lit la page comme un robot de partage (HTML brut, sans JavaScript) : title, description, Open Graph, Twitter, viewport, lang, canonical, icônes.', inputSchema: { url: urlArg } },
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
      title: 'Aperçus de partage',
      description: 'Simule l’aperçu du lien sur WhatsApp, iMessage, Slack, Discord, LinkedIn, X et Google (chaque robot lit la page), liste les problèmes et propose le correctif pour le framework du site.',
      inputSchema: { url: urlArg, platform: z.enum(PLATFORMS.map((p) => p.id) as [Platform, ...Platform[]]).optional() },
    },
    async ({ url, platform }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return fail(r.error);
      const previews = await readSharePreviews(r.url, { headers: headersFor(r.url) });
      const fix = buildShareFix(previews.meta, previews.image);
      const cards = previews.cards.filter((c) => !platform || c.platform === platform);
      const lines = [
        `Aperçus de partage pour ${r.url} (framework : ${fix.frameworkLabel})`,
        '',
        ...cards.map((c) => `${ICON[c.status]} ${c.label} [${c.layout}] titre « ${c.title ?? '—'} »${c.image ? ', avec image' : ', sans image'}${c.problems.length ? `\n    ${c.problems.join('\n    ')}` : ''}`),
        '',
        fix.changes.length ? `Correctif (${fix.file}) :\n${fix.changes.map((c) => `- ${c}`).join('\n')}\n\n\`\`\`${fix.language}\n${fix.code}\n\`\`\`` : 'Aucune correction nécessaire.',
      ];
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'run_checks',
    {
      title: 'Lancer les 24 checks',
      description: 'SEO, partage, mobile et technique. Avec l’app ouverte, inclut les mesures dans les appareils (débordement horizontal, erreurs JavaScript, images lourdes).',
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

  server.registerTool(
    'list_pages',
    { title: 'Pages du site', description: 'Explore le site (liens, sitemap) et liste ses pages avec leur statut HTTP et leur titre.', inputSchema: { url: urlArg } },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return fail(r.error);
      const pages = await crawl(r.url, { headers: headersFor(r.url), limit: 60 });
      return text(pages.map((p) => `${p.status ?? '—'}  ${p.path}${p.title ? `  « ${p.title} »` : ''}`).join('\n'));
    },
  );

  // Prompts become slash commands in Claude Code: /mcp__parakeet__fix_share, /mcp__parakeet__fix_checks
  server.registerPrompt(
    'fix_share',
    { title: 'Corriger les aperçus de partage', description: 'Corrige les balises de partage de la page ouverte dans Parakeet (ou de l’URL donnée), puis vérifie.', argsSchema: { url: z.string().optional() } },
    async ({ url }) => {
      const r = await resolveUrl(url);
      if ('error' in r) return { messages: [{ role: 'user', content: { type: 'text', text: r.error } }] };
      const previews = await readSharePreviews(r.url, { headers: headersFor(r.url) });
      const fix = buildShareFix(previews.meta, previews.image);
      const body = fix.prompt
        ? `${fix.prompt}\n\nQuand c’est fait, appelle l’outil get_share_preview de Parakeet sur ${r.url} pour vérifier que les problèmes ont disparu.`
        : `Les balises de partage de ${r.url} sont déjà complètes. Rien à faire.`;
      return { messages: [{ role: 'user', content: { type: 'text', text: body } }] };
    },
  );

  server.registerPrompt(
    'fix_checks',
    { title: 'Corriger les checks', description: 'Corrige les problèmes trouvés par les 24 checks sur la page ouverte dans Parakeet, puis relance les checks.', argsSchema: { url: z.string().optional() } },
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
            `Parakeet a trouvé ces problèmes sur ${r.url} :`,
            ...bad.map((c) => `- [${c.status === 'error' ? 'problème' : 'à améliorer'}] ${c.label} : ${c.detail}`),
            '',
            'Corrige-les dans le code du projet, sans changer le design ni le contenu visible. Commence par les problèmes.',
            'Ensuite appelle run_checks pour vérifier, et screenshot si tu as touché à la mise en page mobile.',
          ].join('\n')
        : `Tous les checks passent sur ${r.url}. Rien à faire.`;
      return { messages: [{ role: 'user', content: { type: 'text', text: body } }] };
    },
  );

  return server;
}
