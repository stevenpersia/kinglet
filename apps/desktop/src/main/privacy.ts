import { app, BrowserWindow, session, type Session } from 'electron';
import { BANNER_PROBE, t, type PrivacyCapture, type PrivacyRequest } from '@kinglet/core';

/**
 * A first visit, like a stranger's: a session with no cookies (in memory, emptied before each
 * visit), nothing clicked. What loads and what is stored before any consent is what the privacy
 * checks judge. The devices can't tell: their session keeps the choices made on the banner.
 */
const PARTITION = 'kinglet-privacy';
/** Late tags (Tag Manager, consent tools) need a moment after the load event. */
const SETTLE_MS = 3500;

let ses: Session | null = null;
let collecting: PrivacyRequest[] | null = null;
let headersFor: (url: string) => Record<string, string> = () => ({});
let queue: Promise<unknown> = Promise.resolve();

function privacySession(): Session {
  if (ses) return ses;
  ses = session.fromPartition(PARTITION, { cache: false });
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  ses.webRequest.onBeforeSendHeaders((d, cb) => cb({ requestHeaders: { ...d.requestHeaders, ...headersFor(d.url) } }));
  const note = (d: { url: string; resourceType: string }) => {
    if (collecting && collecting.length < 3000 && /^https?:/.test(d.url)) collecting.push({ url: d.url, type: d.resourceType });
  };
  // A request that failed (blocked, offline) was still sent: it counts.
  ses.webRequest.onCompleted(note);
  ses.webRequest.onErrorOccurred(note);
  return ses;
}

const within = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(t('timed out', 'délai dépassé'))), ms))]);

/** A browser user agent without "Electron" and the app name in it (some tags skip unknown browsers). */
const userAgent = () => app.userAgentFallback.replace(/\s(kinglet|Electron)\/\S+/gi, '');

export function capturePrivacy(url: string, headers: (url: string) => Record<string, string>): Promise<PrivacyCapture> {
  const run = async (): Promise<PrivacyCapture> => {
    const s = privacySession();
    await s.clearStorageData().catch(() => undefined);
    await s.clearCache().catch(() => undefined);
    headersFor = headers;
    const requests: PrivacyRequest[] = [];
    collecting = requests;
    const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: true, session: s, sandbox: true } });
    try {
      const wc = win.webContents;
      wc.setAudioMuted(true);
      wc.setUserAgent(userAgent());
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      await within(wc.loadURL(url), 20_000);
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const banner = (await wc.executeJavaScript(BANNER_PROBE).catch(() => null)) as PrivacyCapture['banner'];
      const cookies = (await s.cookies.get({})).map((c) => ({ name: c.name, domain: c.domain ?? '', ...(c.expirationDate ? { expires: c.expirationDate } : {}) }));
      return { source: 'browser', pageUrl: wc.getURL() || url, requests, cookies, banner };
    } finally {
      collecting = null;
      win.destroy();
      await s.clearStorageData().catch(() => undefined);
    }
  };
  // One visit at a time: they share the session.
  const job = queue.then(run, run);
  queue = job.catch(() => undefined);
  return job;
}
