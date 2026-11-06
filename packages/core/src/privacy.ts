import { t } from './i18n.ts';

/**
 * Privacy (GDPR / ePrivacy): what a visitor's browser loads and stores before they have said
 * anything to a consent banner. Measured in a fresh browser session that never clicks; without
 * it, read from the raw HTML (scripts and iframes only, no cookies).
 */

export type TrackerCategory = 'analytics' | 'ads' | 'social' | 'session-replay' | 'tag-manager' | 'exempt';

export interface TrackerDef {
  name: string;
  category: TrackerCategory;
  /** Host suffixes (a request to "www.google-analytics.com" matches "google-analytics.com"). */
  hosts: string[];
  /** Path the request must match: these hosts also serve things that are not tracking (facebook.com, linkedin.com…). */
  path?: RegExp;
  /** Cookie names this vendor sets (regexp on the name). */
  cookies?: RegExp;
}

/**
 * Common trackers. `exempt`: audience measurement that works without cookies or that the CNIL
 * lets run without consent when configured for it (Plausible, Fathom, Matomo in exempt mode…).
 */
export const TRACKERS: TrackerDef[] = [
  { name: 'Google Analytics', category: 'analytics', hosts: ['google-analytics.com', 'analytics.google.com'], cookies: /^(_ga|_ga_\w+|_gid|_gat\w*|__utm[abcz])$/ },
  { name: 'Google Tag Manager', category: 'tag-manager', hosts: ['googletagmanager.com'] },
  { name: 'Google Ads / DoubleClick', category: 'ads', hosts: ['doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'adservice.google.com', 'pagead2.googlesyndication.com'], cookies: /^(_gcl_\w+|IDE|DSID|test_cookie|__gads|__gpi)$/ },
  { name: 'Meta Pixel', category: 'ads', hosts: ['connect.facebook.net', 'facebook.com'], path: /^\/(tr\/?$|signals\/|[\w-]+\/fbevents)/, cookies: /^(_fbp|_fbc|fr)$/ },
  { name: 'LinkedIn Insight', category: 'ads', hosts: ['snap.licdn.com', 'px.ads.linkedin.com', 'linkedin.com'], path: /\/(li\.lms-analytics|collect|insight)/, cookies: /^(li_sugr|lidc|bcookie|UserMatchHistory|AnalyticsSyncHistory|li_fat_id|ln_or)$/ },
  { name: 'TikTok Pixel', category: 'ads', hosts: ['analytics.tiktok.com'], cookies: /^(_ttp|_tt_enable_cookie)$/ },
  { name: 'X (Twitter) Pixel', category: 'ads', hosts: ['static.ads-twitter.com', 'ads-twitter.com', 'analytics.twitter.com', 't.co'], path: /\/(uwt|i\/adsct|1\/i\/adsct)/, cookies: /^(muc_ads|personalization_id)$/ },
  { name: 'Pinterest Tag', category: 'ads', hosts: ['ct.pinterest.com', 's.pinimg.com'], path: /\/(ct|v3|user)/, cookies: /^(_pin_unauth|_pinterest_ct_ua|_epik)$/ },
  { name: 'Snap Pixel', category: 'ads', hosts: ['sc-static.net', 'tr.snapchat.com'], cookies: /^_scid/ },
  { name: 'Reddit Pixel', category: 'ads', hosts: ['redditstatic.com', 'alb.reddit.com'], path: /\/(ads|rp\.gif|pixel)/, cookies: /^_rdt_uuid$/ },
  { name: 'Microsoft Ads (UET)', category: 'ads', hosts: ['bat.bing.com'], cookies: /^(_uetsid|_uetvid|MUID)$/ },
  { name: 'Criteo', category: 'ads', hosts: ['criteo.com', 'criteo.net'] },
  { name: 'Taboola', category: 'ads', hosts: ['taboola.com'] },
  { name: 'Outbrain', category: 'ads', hosts: ['outbrain.com'] },
  { name: 'Hotjar', category: 'session-replay', hosts: ['hotjar.com', 'hotjar.io'], cookies: /^_hj/ },
  { name: 'Microsoft Clarity', category: 'session-replay', hosts: ['clarity.ms'], cookies: /^(_clck|_clsk|CLID|ANONCHK|SM)$/ },
  { name: 'FullStory', category: 'session-replay', hosts: ['fullstory.com'], cookies: /^fs_/ },
  { name: 'LogRocket', category: 'session-replay', hosts: ['logrocket.io', 'lr-ingest.io', 'lr-in-prod.com'] },
  { name: 'Mouseflow', category: 'session-replay', hosts: ['mouseflow.com'] },
  { name: 'Smartlook', category: 'session-replay', hosts: ['smartlook.com', 'smartlook.cloud'] },
  { name: 'Contentsquare', category: 'session-replay', hosts: ['contentsquare.net'], cookies: /^_cs_/ },
  { name: 'Mixpanel', category: 'analytics', hosts: ['mixpanel.com', 'mxpnl.com'], cookies: /^mp_/ },
  { name: 'Amplitude', category: 'analytics', hosts: ['amplitude.com'], cookies: /^AMP_/ },
  { name: 'Segment', category: 'analytics', hosts: ['segment.com', 'segment.io'], cookies: /^ajs_/ },
  { name: 'Heap', category: 'analytics', hosts: ['heapanalytics.com', 'heap-api.com'], cookies: /^_hp2_/ },
  { name: 'PostHog', category: 'analytics', hosts: ['posthog.com'], cookies: /^ph_/ },
  { name: 'HubSpot', category: 'analytics', hosts: ['hs-scripts.com', 'hs-analytics.net', 'hubspot.com', 'hsforms.net', 'hs-banner.com'], cookies: /^(__hstc|hubspotutk|__hssc|__hssrc)$/ },
  { name: 'Yandex Metrica', category: 'analytics', hosts: ['mc.yandex.ru', 'mc.yandex.com'], cookies: /^_ym/ },
  { name: 'Matomo', category: 'exempt', hosts: ['matomo.cloud', 'innocraft.cloud'], path: /matomo|piwik/, cookies: /^(_pk_id|_pk_ses)/ },
  { name: 'Plausible', category: 'exempt', hosts: ['plausible.io'] },
  { name: 'Fathom', category: 'exempt', hosts: ['usefathom.com'] },
  { name: 'Simple Analytics', category: 'exempt', hosts: ['simpleanalyticscdn.com', 'simpleanalytics.com'] },
  { name: 'Umami', category: 'exempt', hosts: ['umami.is', 'cloud.umami.is'] },
  { name: 'Vercel Analytics', category: 'exempt', hosts: ['va.vercel-scripts.com', 'vitals.vercel-insights.com'] },
  { name: 'Cloudflare Web Analytics', category: 'exempt', hosts: ['static.cloudflareinsights.com', 'cloudflareinsights.com'] },
  { name: 'Pirsch', category: 'exempt', hosts: ['pirsch.io'] },
];

/** Third-party content that sends the visitor's IP (and often cookies) to another company. */
export const EMBEDS: { name: string; hosts: string[]; path?: RegExp; fix: [string, string] }[] = [
  { name: 'Google Fonts', hosts: ['fonts.googleapis.com', 'fonts.gstatic.com'], fix: ['host the fonts with the site (a German court fined a site for loading them from Google)', 'héberge les polices avec le site (un tribunal allemand a condamné un site qui les chargeait chez Google)'] },
  { name: 'YouTube', hosts: ['youtube.com', 'www.youtube.com'], path: /\/(embed|iframe_api|s\/player)/, fix: ['use youtube-nocookie.com, or show the video after a click', 'utilise youtube-nocookie.com, ou affiche la vidéo après un clic'] },
  { name: 'Google Maps', hosts: ['maps.googleapis.com', 'maps.google.com', 'www.google.com'], path: /\/maps/, fix: ['show a static image and load the map after a click', 'affiche une image et charge la carte après un clic'] },
  { name: 'Vimeo', hosts: ['player.vimeo.com'], fix: ['add ?dnt=1 to the player URL', 'ajoute ?dnt=1 à l’URL du lecteur'] },
  { name: 'X (Twitter) embed', hosts: ['platform.twitter.com'], fix: ['load the widget after consent', 'charge le widget après consentement'] },
  { name: 'Facebook embed', hosts: ['www.facebook.com', 'connect.facebook.net'], path: /\/(plugins|sdk\.js)/, fix: ['load the widget after consent', 'charge le widget après consentement'] },
  { name: 'Instagram embed', hosts: ['www.instagram.com'], path: /\/embed/, fix: ['load the widget after consent', 'charge le widget après consentement'] },
  { name: 'reCAPTCHA', hosts: ['www.google.com', 'www.gstatic.com', 'www.recaptcha.net'], path: /\/recaptcha/, fix: ['mention it in the privacy policy, or use a cookieless captcha', 'mentionne-le dans la politique de confidentialité, ou prends un captcha sans cookie'] },
];

/** Consent management platforms, by script host or global. */
export const CMPS: { name: string; hosts: string[] }[] = [
  { name: 'Axeptio', hosts: ['axept.io', 'axeptio.eu'] },
  { name: 'Didomi', hosts: ['didomi.io', 'privacy-center.org'] },
  { name: 'Cookiebot', hosts: ['cookiebot.com', 'cookiebot.eu'] },
  { name: 'OneTrust', hosts: ['cookielaw.org', 'onetrust.com', 'cookiepro.com'] },
  { name: 'tarteaucitron', hosts: ['tarteaucitron.io'] },
  { name: 'Usercentrics', hosts: ['usercentrics.eu', 'usercentrics.com'] },
  { name: 'Iubenda', hosts: ['iubenda.com'] },
  { name: 'CookieYes', hosts: ['cookieyes.com'] },
  { name: 'Complianz', hosts: ['complianz.io'] },
  { name: 'Termly', hosts: ['termly.io'] },
  { name: 'Osano', hosts: ['osano.com'] },
  { name: 'Sirdata', hosts: ['sddan.com', 'sirdata.com'] },
  { name: 'Quantcast Choice', hosts: ['quantcast.mgr.consensu.org', 'cmp.quantcast.com'] },
  { name: 'Klaro', hosts: ['kiprotect.com'] },
  { name: 'Cookie Script', hosts: ['cookie-script.com'] },
];

/**
 * Runs in the page: is a consent banner (or a CMP) there? Looks for known CMP globals and for a
 * visible box that talks about cookies and has buttons.
 */
export const BANNER_PROBE = `(() => {
  const globals = { Didomi: 'Didomi', axeptioSDK: 'Axeptio', _axcb: 'Axeptio', Cookiebot: 'Cookiebot', OneTrust: 'OneTrust', OptanonWrapper: 'OneTrust', tarteaucitron: 'tarteaucitron', UC_UI: 'Usercentrics', __ucCmp: 'Usercentrics', _iub: 'Iubenda', klaro: 'Klaro', cookieyes: 'CookieYes', CookieScript: 'Cookie Script', __tcfapi: 'TCF' };
  let cmp = null;
  for (const k in globals) if (window[k]) { cmp = globals[k]; break; }
  const words = /cookie|consent|traceur|confidentialit|privacy|rgpd|gdpr|datenschutz/i;
  const accept = /accept|agree|ok\\b|allow|autoriser|j[’']accepte|tout accepter|d[’']accord|continuer|got it|compris|alle akzeptieren/i;
  const refuse = /refus|reject|decline|deny|continuer sans|tout refuser|only necessary|nécessaires|ablehnen|non merci|no thanks/i;
  let text = false, hasReject = false;
  const boxes = [...document.querySelectorAll('[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i],[class*=gdpr i],[id*=gdpr i],[class*=rgpd i],[aria-label*=cookie i],[role=dialog],[role=alertdialog],dialog,aside,footer ~ div,body > div')].slice(0, 400);
  for (const el of boxes) {
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 30) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const txt = (el.innerText || '').slice(0, 3000);
    if (!words.test(txt) || txt.length > 2500) continue;
    const buttons = [...el.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')].map((b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim());
    if (!buttons.some((b) => accept.test(b) || refuse.test(b))) continue;
    text = true;
    hasReject = buttons.some((b) => refuse.test(b));
    break;
  }
  return { cmp, visible: text, reject: hasReject };
})()`;

export interface PrivacyRequest {
  url: string;
  /** Resource type (script, image, xhr, subFrame, stylesheet, font…) when known. */
  type?: string;
}

export interface PrivacyCookie {
  name: string;
  domain: string;
  /** Seconds since epoch; absent for a session cookie. */
  expires?: number;
}

/** What a fresh visit loaded and stored, without any click. */
export interface PrivacyCapture {
  /** 'browser': a real visit in a fresh session. 'html': read from the HTML only (no cookies, no scripts run). */
  source: 'browser' | 'html';
  pageUrl: string;
  requests: PrivacyRequest[];
  cookies: PrivacyCookie[];
  banner: { cmp: string | null; visible: boolean; reject: boolean } | null;
}

export interface TrackerHit {
  name: string;
  category: TrackerCategory;
  /** A few of the URLs that matched. */
  urls: string[];
  /** Tracking cookies of this vendor found. */
  cookies: string[];
}

export interface PrivacyReport {
  source: PrivacyCapture['source'];
  /** Trackers that need consent, loaded before any. */
  trackers: TrackerHit[];
  /** Exempt audience measurement found (fine without consent). */
  exempt: TrackerHit[];
  /** Tracking cookies stored before consent (vendor known or name recognised). */
  trackingCookies: { name: string; domain: string; vendor: string | null }[];
  /** Cookies set by other domains than the site's. */
  thirdPartyCookies: { name: string; domain: string }[];
  embeds: { name: string; fix: string }[];
  /** Consent tool detected (by script or global), and whether a banner is visible with a reject button. */
  cmp: string | null;
  banner: { visible: boolean; reject: boolean } | null;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const matchesHost = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`);

/** Registrable-ish domain: the last two labels (three for co.uk-like ones). Good enough to tell first and third party apart. */
export function siteOf(host: string): string {
  const h = host.replace(/^\./, '').toLowerCase();
  const parts = h.split('.');
  if (parts.length <= 2 || /^\d+$/.test(parts[parts.length - 1]!)) return h;
  const two = parts.slice(-2).join('.');
  return /^(co|com|org|net|gov|ac|gouv)\.\w{2}$/.test(two) ? parts.slice(-3).join('.') : two;
}

/** Known names of tracking cookies whose vendor's script may have been renamed or self-hosted. */
const GENERIC_TRACKING_COOKIE = /^(_ga|_ga_\w+|_gid|_gcl_\w+|_fbp|_fbc|_hj\w*|_clck|_clsk|_uetsid|_uetvid|_ttp|_pin_unauth|_scid|ajs_\w+|mp_\w+|_hp2_\w+|__hstc|hubspotutk|_ym\w*|IDE|MUID)$/;

export function assessPrivacy(capture: PrivacyCapture): PrivacyReport {
  const pageSite = siteOf(hostOf(capture.pageUrl));
  const hits = new Map<string, TrackerHit>();
  const hit = (def: TrackerDef) => {
    if (!hits.has(def.name)) hits.set(def.name, { name: def.name, category: def.category, urls: [], cookies: [] });
    return hits.get(def.name)!;
  };
  let cmp = capture.banner?.cmp ?? null;
  const embeds = new Map<string, string>();
  for (const r of capture.requests) {
    const host = hostOf(r.url);
    if (!host) continue;
    let path = '';
    try {
      path = new URL(r.url).pathname;
    } catch {
      /* host only */
    }
    for (const def of TRACKERS) {
      if (!def.hosts.some((h) => matchesHost(host, h))) continue;
      if (def.path && !def.path.test(path)) continue;
      const h = hit(def);
      if (h.urls.length < 3 && !h.urls.includes(r.url)) h.urls.push(r.url.length > 120 ? `${r.url.slice(0, 119)}…` : r.url);
      break;
    }
    // Self-hosted Matomo (matomo.js / piwik.js on the site's own domain).
    if (/\/(matomo|piwik)\.(js|php)/.test(path)) hit(TRACKERS.find((d) => d.name === 'Matomo')!);
    for (const c of CMPS) if (!cmp && c.hosts.some((h) => matchesHost(host, h))) cmp = c.name;
    for (const e of EMBEDS) if (e.hosts.some((h) => matchesHost(host, h)) && (!e.path || e.path.test(path))) embeds.set(e.name, t(e.fix[0], e.fix[1]));
  }

  const trackingCookies: PrivacyReport['trackingCookies'] = [];
  const thirdPartyCookies: PrivacyReport['thirdPartyCookies'] = [];
  for (const c of capture.cookies) {
    const vendor = TRACKERS.find((d) => d.cookies?.test(c.name));
    if (vendor) {
      hit(vendor).cookies.push(c.name);
      if (vendor.category !== 'exempt') trackingCookies.push({ name: c.name, domain: c.domain, vendor: vendor.name });
    } else if (GENERIC_TRACKING_COOKIE.test(c.name)) trackingCookies.push({ name: c.name, domain: c.domain, vendor: null });
    if (siteOf(c.domain) !== pageSite) thirdPartyCookies.push({ name: c.name, domain: c.domain.replace(/^\./, '') });
  }

  const all = [...hits.values()];
  return {
    source: capture.source,
    trackers: all.filter((h) => h.category !== 'exempt'),
    exempt: all.filter((h) => h.category === 'exempt'),
    trackingCookies,
    thirdPartyCookies,
    embeds: [...embeds].map(([name, fix]) => ({ name, fix })),
    cmp,
    banner: capture.banner ? { visible: capture.banner.visible, reject: capture.banner.reject } : null,
  };
}

/** The HTML only: scripts, iframes and stylesheets it references (what a fresh visit would at least load). */
export function privacyFromHtml(pageUrl: string, resources: string[]): PrivacyCapture {
  return { source: 'html', pageUrl, requests: resources.map((url) => ({ url })), cookies: [], banner: null };
}

/** The findings, for Claude. */
export function privacyPrompt(r: PrivacyReport): string[] {
  const lines: string[] = [];
  for (const h of r.trackers) lines.push(`- ${h.name} (${h.category}) loads before consent${h.cookies.length ? `, sets ${h.cookies.join(', ')}` : ''}`);
  for (const c of r.trackingCookies.filter((c) => !c.vendor)) lines.push(`- Tracking cookie ${c.name} (${c.domain}) set before consent`);
  if (r.trackers.length && !r.cmp && !r.banner?.visible) lines.push('- No consent banner: trackers need the visitor’s consent first (GDPR / ePrivacy)');
  if (r.banner?.visible && !r.banner.reject) lines.push('- The consent banner has no button to refuse as easily as to accept');
  for (const e of r.embeds) lines.push(`- ${e.name}: ${e.fix}`);
  return lines;
}
