import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { BrowserWindow, dialog, type NativeImage } from 'electron';
import {
  OG_MAX_BYTES,
  OG_SIZE,
  buildOgImageHtml,
  buildOgImageTags,
  frameworkFromPackage,
  freeName,
  ogImageDefaults,
  ogLogoCandidate,
  readPageMeta,
  staticDirFor,
  t,
  type Framework,
  type OgImageInput,
} from '@kinglet/core';
import type { OgImageDraft, OgImageRender, OgImageSaved } from '../shared/types';

/** Where to save and which tags to give: the project's folder and framework, the production origin. */
export interface OgContext {
  folder: string | null;
  /** Production URL of the project (Vercel), when known. */
  productionUrl: string | null;
  headers: (url: string) => Record<string, string>;
}

const LOGO_MAX = 1024 * 1024;

/** The logo as a data URL, so the template renders without network (and the preview too). */
async function logoDataUrl(url: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!type.startsWith('image/') || type === 'image/x-icon' || type === 'image/vnd.microsoft.icon') return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > LOGO_MAX) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function folderFramework(folder: string | null): Framework | null {
  if (!folder) return null;
  try {
    return frameworkFromPackage(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')));
  } catch {
    return null;
  }
}

const hostOf = (u: string | null) => {
  try {
    return u ? new URL(u.startsWith('http') ? u : `https://${u}`).host : null;
  } catch {
    return null;
  }
};

/** The editor's starting point for this page. */
export async function ogImageDraft(url: string, ctx: OgContext): Promise<OgImageDraft> {
  const meta = await readPageMeta(url, { headers: ctx.headers(url) });
  const logoUrl = ogLogoCandidate(meta);
  const logo = logoUrl ? await logoDataUrl(logoUrl, ctx.headers(logoUrl)) : null;
  const prodHost = hostOf(ctx.productionUrl);
  const framework = folderFramework(ctx.folder) ?? meta.framework;
  const dir = ctx.folder ? join(ctx.folder, staticDirFor(framework)) : null;
  return {
    input: ogImageDefaults(meta, { domain: prodHost, logo }),
    framework,
    folder: ctx.folder,
    targetDir: dir,
    origin: prodHost ? `https://${prodHost}` : new URL(meta.finalUrl).origin,
    page: new URL(meta.finalUrl).pathname,
  };
}

/** PNG under the size limit, else JPEG at decreasing quality. */
function encode(img: NativeImage): { data: Buffer; ext: 'png' | 'jpg' } {
  const png = img.toPNG();
  if (png.length <= OG_MAX_BYTES) return { data: png, ext: 'png' };
  for (const q of [92, 85, 78, 70, 60]) {
    const jpg = img.toJPEG(q);
    if (jpg.length <= OG_MAX_BYTES) return { data: jpg, ext: 'jpg' };
  }
  return { data: img.toJPEG(50), ext: 'jpg' };
}

/** Renders the template off screen at exactly 1200×630 (scale 1). */
export async function renderOgImage(input: OgImageInput): Promise<{ data: Buffer; ext: 'png' | 'jpg' }> {
  const { width, height } = OG_SIZE;
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true, javascript: false, zoomFactor: 1 },
  });
  try {
    const wc = win.webContents;
    win.setContentSize(width, height);
    await wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildOgImageHtml(input)));
    // Fonts and the data-URL logo decode after load: give them a frame or two.
    await new Promise((r) => setTimeout(r, 250));
    let img = await wc.capturePage({ x: 0, y: 0, width, height });
    const size = img.getSize();
    if (size.width !== width || size.height !== height) img = img.resize({ width, height, quality: 'best' });
    return encode(img);
  } finally {
    win.destroy();
  }
}

export async function previewOgImage(input: OgImageInput): Promise<OgImageRender> {
  const { data, ext } = await renderOgImage(input);
  return { dataUrl: `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${data.toString('base64')}`, bytes: data.length, format: ext };
}

/**
 * Writes the image in the project's static folder, under a name not taken yet (og.png, og-2.png…),
 * or where the user chooses (no folder, or `choose`). Returns null when the dialog is cancelled.
 */
export async function saveOgImage(win: BrowserWindow, input: OgImageInput, draft: Pick<OgImageDraft, 'framework' | 'folder' | 'targetDir' | 'origin' | 'page'>, choose = false): Promise<OgImageSaved | null> {
  const { data, ext } = await renderOgImage(input);
  let path: string;
  if (draft.targetDir && !choose) {
    mkdirSync(draft.targetDir, { recursive: true });
    path = join(draft.targetDir, freeName((n) => existsSync(join(draft.targetDir!, n)), 'og', ext));
  } else {
    const r = await dialog.showSaveDialog(win, {
      title: t('Save the share image', 'Enregistrer l’image de partage'),
      defaultPath: join(draft.targetDir ?? draft.folder ?? homedir(), `og.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    path = extname(r.filePath) ? r.filePath : `${r.filePath}.${ext}`;
  }
  writeFileSync(path, data);
  // Path on the site: relative to the static folder when the file is inside it, else its name at the root.
  const inStatic = draft.targetDir && (path.startsWith(draft.targetDir + sep) || dirname(path) === draft.targetDir);
  const webPath = '/' + (inStatic ? relative(draft.targetDir!, path).split(sep).join('/') : basename(path));
  const tags = buildOgImageTags(draft.framework, draft.origin, webPath, path, draft.page);
  return { path, webPath, bytes: data.length, format: ext, inProject: !!inStatic, tags };
}
