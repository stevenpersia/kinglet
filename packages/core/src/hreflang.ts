import { readPageMeta, type FetchOptions, type PageMeta } from './meta.ts';
import { t } from './i18n.ts';

/** Language (ISO 639-1/2), optional script, optional region (ISO 3166-1 or UN M.49), or x-default. */
const CODE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;
/** Common mistakes: "en-UK" (it's en-GB), "jp" (it's ja), underscores. */
const WRONG: Record<string, string> = { 'en-uk': 'en-GB', jp: 'ja', 'ja-jp': 'ja-JP', cn: 'zh', 'zh-cn': 'zh-Hans or zh-CN', gr: 'el', cz: 'cs', dk: 'da', se: 'sv', kr: 'ko' };

export interface HreflangIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface HreflangAlternate {
  lang: string;
  href: string;
  /** HTTP status of the alternate (null: not read or unreachable). */
  status: number | null;
  /** The alternate lists this page back (null: not read). */
  returns: boolean | null;
  /** Its canonical points at itself (null: not read, or no canonical). */
  canonicalSelf: boolean | null;
}

export interface HreflangReport {
  alternates: HreflangAlternate[];
  issues: HreflangIssue[];
  /** The alternates were fetched (return links checked). */
  checkedReturns: boolean;
}

const norm = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
};

/** What can be told from the page alone: codes, absolute URLs, self-reference, x-default, canonical. */
export function checkHreflangTags(meta: Pick<PageMeta, 'hreflang' | 'finalUrl' | 'canonical' | 'lang'>): HreflangIssue[] {
  const issues: HreflangIssue[] = [];
  const list = meta.hreflang;
  if (!list.length) return issues;
  const seen = new Map<string, string>();
  for (const h of list) {
    const code = h.lang.toLowerCase();
    if (WRONG[code]) issues.push({ severity: 'error', message: t(`“${h.lang}” is not a valid code: use ${WRONG[code]}.`, `« ${h.lang} » n’est pas un code valide : utilise ${WRONG[code]}.`) });
    else if (!CODE.test(h.lang)) issues.push({ severity: 'error', message: t(`“${h.lang}” is not a valid hreflang code (e.g. fr, en-GB, x-default).`, `« ${h.lang} » n’est pas un code hreflang valide (ex. fr, en-GB, x-default).`) });
    if (!/^https?:\/\//i.test(h.href)) issues.push({ severity: 'error', message: t(`${h.lang}: the URL must be absolute (${h.href}).`, `${h.lang} : l’URL doit être absolue (${h.href}).`) });
    const before = seen.get(code);
    if (before && norm(before) !== norm(h.href)) issues.push({ severity: 'error', message: t(`${h.lang} points at two different URLs.`, `${h.lang} pointe vers deux URL différentes.`) });
    seen.set(code, h.href);
  }
  const self = norm(meta.canonical ?? meta.finalUrl);
  if (!list.some((h) => norm(h.href) === self || norm(h.href) === norm(meta.finalUrl)))
    issues.push({ severity: 'error', message: t('The page does not list itself among its hreflang alternates.', 'La page ne se cite pas elle-même parmi ses alternatives hreflang.') });
  if (!list.some((h) => h.lang.toLowerCase() === 'x-default')) issues.push({ severity: 'warning', message: t('No x-default: visitors in other languages get no fallback.', 'Pas de x-default : les visiteurs d’autres langues n’ont pas de version par défaut.') });
  if (meta.canonical && norm(meta.canonical) !== norm(meta.finalUrl))
    issues.push({ severity: 'warning', message: t('The canonical points elsewhere: Google ignores the hreflang of a non-canonical page.', 'La canonique pointe ailleurs : Google ignore les hreflang d’une page non canonique.') });
  const own = list.find((h) => norm(h.href) === norm(meta.finalUrl));
  if (own && meta.lang && own.lang.toLowerCase() !== 'x-default' && own.lang.split('-')[0]!.toLowerCase() !== meta.lang.split('-')[0]!.toLowerCase())
    issues.push({ severity: 'warning', message: t(`The page says lang="${meta.lang}" but lists itself as ${own.lang}.`, `La page dit lang="${meta.lang}" mais se cite en ${own.lang}.`) });
  return issues;
}

/** The tags, then each alternate fetched: does it answer, list this page back, and is it its own canonical? */
export async function readHreflang(meta: PageMeta, opts: FetchOptions & { limit?: number } = {}): Promise<HreflangReport> {
  const issues = checkHreflangTags(meta);
  const self = norm(meta.finalUrl);
  const others = meta.hreflang.filter((h) => /^https?:\/\//.test(h.href) && norm(h.href) !== self);
  const unique = [...new Map(others.map((h) => [norm(h.href), h])).values()].slice(0, opts.limit ?? 12);
  const read = new Map(
    await Promise.all(
      unique.map(async (h) => {
        try {
          return [norm(h.href), await readPageMeta(h.href, { ...opts, bot: 'google' })] as const;
        } catch {
          return [norm(h.href), null] as const;
        }
      }),
    ),
  );
  const alternates: HreflangAlternate[] = meta.hreflang.map((h) => {
    if (norm(h.href) === self) return { ...h, status: meta.status, returns: true, canonicalSelf: meta.canonical ? norm(meta.canonical) === self : null };
    const m = read.get(norm(h.href));
    if (m === undefined) return { ...h, status: null, returns: null, canonicalSelf: null };
    if (!m) return { ...h, status: null, returns: false, canonicalSelf: null };
    return { ...h, status: m.status, returns: m.hreflang.some((x) => norm(x.href) === self), canonicalSelf: m.canonical ? norm(m.canonical) === norm(m.finalUrl) : null };
  });
  for (const a of alternates) {
    if (norm(a.href) === self) continue;
    if (a.status === null && a.returns === false) issues.push({ severity: 'error', message: t(`${a.lang}: unreachable (${a.href}).`, `${a.lang} : injoignable (${a.href}).`) });
    else if (a.status !== null && a.status >= 400) issues.push({ severity: 'error', message: t(`${a.lang}: HTTP ${a.status} (${a.href}).`, `${a.lang} : HTTP ${a.status} (${a.href}).`) });
    else if (a.returns === false) issues.push({ severity: 'error', message: t(`${a.lang} does not link back to this page: Google ignores one-way hreflang.`, `${a.lang} ne renvoie pas vers cette page : Google ignore les hreflang à sens unique.`) });
    else if (a.canonicalSelf === false) issues.push({ severity: 'warning', message: t(`${a.lang}: its canonical points elsewhere.`, `${a.lang} : sa canonique pointe ailleurs.`) });
  }
  return { alternates, issues, checkedReturns: unique.length > 0 };
}
