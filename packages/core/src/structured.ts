import { t } from './i18n.ts';

/**
 * Structured data (JSON-LD, schema.org) and what Google can draw from it.
 * Required and recommended properties follow Google's rich result guidelines, simplified:
 * a page that passes here can still be refused by Google (content, policy…).
 */

type Obj = Record<string, unknown>;

export type RichKind = 'article' | 'product' | 'faq' | 'breadcrumb' | 'organization' | 'website' | 'event' | 'recipe' | 'localbusiness' | 'video' | 'howto' | 'review' | 'other';

export interface StructuredItem {
  /** schema.org type(s), e.g. "Product" or "NewsArticle". */
  type: string;
  kind: RichKind;
  /** Name, headline or title of the item, when it has one. */
  name: string | null;
  /** Required properties that are missing: Google shows no rich result without them. */
  missing: string[];
  /** Recommended properties that are missing: the rich result is poorer. */
  recommended: string[];
  /** Eligible for a rich result in Google (required properties present, known type). */
  rich: boolean;
  data: Obj;
}

export interface RichPreview {
  /** Breadcrumb trail shown instead of the URL. */
  breadcrumb: string[] | null;
  rating: { value: number; count: number | null; best: number } | null;
  price: string | null;
  availability: string | null;
  /** Questions shown under the result (FAQ). */
  faq: { q: string; a: string }[];
  /** Date shown before the description (article, event). */
  date: string | null;
  /** Event place, recipe time… */
  extra: string | null;
  image: string | null;
}

export interface StructuredData {
  items: StructuredItem[];
  /** JSON-LD blocks that are not valid JSON. */
  errors: string[];
  preview: RichPreview;
}

const types = (o: Obj): string[] => {
  const raw = o['@type'];
  return (Array.isArray(raw) ? raw : [raw]).filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^https?:\/\/schema\.org\//, ''));
};

/** Every typed object of a JSON-LD document: arrays and @graph unfolded. */
export function flattenJsonLd(docs: unknown[]): Obj[] {
  const out: Obj[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const o = v as Obj;
    if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(visit);
    if (types(o).length) out.push(o);
  };
  docs.forEach(visit);
  return out;
}

const has = (o: Obj, path: string): boolean => {
  let cur: unknown = o;
  for (const k of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[0];
    if (!cur || typeof cur !== 'object') return false;
    cur = (cur as Obj)[k];
  }
  if (Array.isArray(cur)) return cur.length > 0;
  return cur !== undefined && cur !== null && cur !== '';
};

const str = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return str(v[0]);
  if (v && typeof v === 'object') return str((v as Obj)['name'] ?? (v as Obj)['@id'] ?? (v as Obj)['url']);
  return null;
};

const first = (v: unknown): Obj | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x && typeof x === 'object' ? (x as Obj) : null;
};

const KINDS: [RegExp, RichKind][] = [
  [/^(Article|NewsArticle|BlogPosting|TechArticle|Report)$/, 'article'],
  [/^(Product|ProductGroup|SoftwareApplication|MobileApplication|WebApplication|Book|Course)$/, 'product'],
  [/^FAQPage$/, 'faq'],
  [/^BreadcrumbList$/, 'breadcrumb'],
  [/^(Organization|Corporation|NGO|EducationalOrganization)$/, 'organization'],
  [/^WebSite$/, 'website'],
  [/^(Event|MusicEvent|BusinessEvent|EducationEvent|SportsEvent|TheaterEvent|Festival)$/, 'event'],
  [/^Recipe$/, 'recipe'],
  [/^(LocalBusiness|Restaurant|Store|Hotel|Dentist|MedicalBusiness|ProfessionalService|FoodEstablishment|CafeOrCoffeeShop|Bakery|BarOrPub|HealthAndBeautyBusiness)$/, 'localbusiness'],
  [/^VideoObject$/, 'video'],
  [/^HowTo$/, 'howto'],
  [/^Review$/, 'review'],
];

const kindOf = (ts: string[]): RichKind => {
  for (const t of ts) for (const [re, k] of KINDS) if (re.test(t)) return k;
  return 'other';
};

/** Required (any one of a list counts) and recommended properties, per kind. */
const RULES: Record<RichKind, { required: (string | string[])[]; recommended: string[]; rich: boolean }> = {
  article: { required: ['headline'], recommended: ['image', 'datePublished', 'author'], rich: true },
  product: { required: ['name', ['offers', 'review', 'aggregateRating']], recommended: ['image', 'offers.price', 'offers.priceCurrency', 'aggregateRating'], rich: true },
  faq: { required: ['mainEntity'], recommended: [], rich: true },
  breadcrumb: { required: ['itemListElement'], recommended: [], rich: true },
  organization: { required: [], recommended: ['name', 'url', 'logo'], rich: false },
  website: { required: [], recommended: ['name', 'url'], rich: false },
  event: { required: ['name', 'startDate', 'location'], recommended: ['image', 'description', 'endDate', 'offers'], rich: true },
  recipe: { required: ['name', 'image'], recommended: ['recipeIngredient', 'recipeInstructions', 'totalTime', 'aggregateRating'], rich: true },
  localbusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHoursSpecification', 'geo', 'image'], rich: true },
  video: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'duration', 'contentUrl'], rich: true },
  howto: { required: ['name', 'step'], recommended: ['image', 'totalTime'], rich: false },
  review: { required: ['itemReviewed', 'reviewRating', 'author'], recommended: [], rich: true },
  other: { required: [], recommended: [], rich: false },
};

function validate(o: Obj, kind: RichKind): { missing: string[]; recommended: string[] } {
  const r = RULES[kind];
  const missing = r.required.filter((req) => (Array.isArray(req) ? !req.some((k) => has(o, k)) : !has(o, req))).map((req) => (Array.isArray(req) ? req.join(t(' or ', ' ou ')) : req));
  // A few nested requirements Google checks.
  if (kind === 'faq' && has(o, 'mainEntity')) {
    const qs = (Array.isArray(o['mainEntity']) ? o['mainEntity'] : [o['mainEntity']]) as Obj[];
    if (qs.some((q) => !has(q ?? {}, 'name') || !has(q ?? {}, 'acceptedAnswer.text'))) missing.push('mainEntity[].name / acceptedAnswer.text');
  }
  if (kind === 'breadcrumb' && has(o, 'itemListElement')) {
    const items = (Array.isArray(o['itemListElement']) ? o['itemListElement'] : [o['itemListElement']]) as Obj[];
    if (items.some((i) => !has(i ?? {}, 'position') || !(has(i ?? {}, 'name') || has(i ?? {}, 'item.name')))) missing.push('itemListElement[].position / name');
  }
  if (kind === 'product' && has(o, 'offers') && !has(o, 'offers.price') && !has(o, 'offers.lowPrice')) missing.push('offers.price');
  const recommended = r.recommended.filter((k) => !has(o, k));
  return { missing, recommended };
}

const fmtDate = (v: unknown, loc: string) => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
};

export function readStructuredData(jsonLd: unknown[], errors: string[] = [], loc = 'en-US'): StructuredData {
  const objects = flattenJsonLd(jsonLd);
  const items: StructuredItem[] = objects.map((o) => {
    const ts = types(o);
    const kind = kindOf(ts);
    const { missing, recommended } = validate(o, kind);
    return { type: ts.join(', '), kind, name: str(o['name'] ?? o['headline'] ?? o['title']), missing, recommended, rich: RULES[kind].rich && missing.length === 0, data: o };
  });

  const preview: RichPreview = { breadcrumb: null, rating: null, price: null, availability: null, faq: [], date: null, extra: null, image: null };
  const ok = (k: RichKind) => items.find((i) => i.kind === k && i.missing.length === 0)?.data ?? null;
  const crumbs = ok('breadcrumb');
  if (crumbs) {
    const list = (Array.isArray(crumbs['itemListElement']) ? crumbs['itemListElement'] : [crumbs['itemListElement']]) as Obj[];
    preview.breadcrumb = [...list].sort((a, b) => Number(a['position'] ?? 0) - Number(b['position'] ?? 0)).map((i) => str(i['name']) ?? str(first(i['item'])?.['name']) ?? '').filter(Boolean);
  }
  const product = ok('product') ?? ok('recipe') ?? ok('localbusiness');
  const rated = product ?? items.find((i) => has(i.data, 'aggregateRating.ratingValue'))?.data ?? null;
  const agg = rated ? first(rated['aggregateRating']) : null;
  if (agg && has(agg, 'ratingValue')) {
    preview.rating = { value: Number(agg['ratingValue']), count: has(agg, 'ratingCount') ? Number(agg['ratingCount']) : has(agg, 'reviewCount') ? Number(agg['reviewCount']) : null, best: has(agg, 'bestRating') ? Number(agg['bestRating']) : 5 };
  }
  const offer = product ? first(product['offers']) : null;
  if (offer) {
    const price = str(offer['price'] ?? offer['lowPrice']);
    const cur = str(offer['priceCurrency']);
    if (price) {
      const n = Number(price);
      try {
        preview.price = cur && !Number.isNaN(n) ? n.toLocaleString(loc, { style: 'currency', currency: cur }) : `${price}${cur ? ` ${cur}` : ''}`;
      } catch {
        preview.price = `${price}${cur ? ` ${cur}` : ''}`;
      }
    }
    const av = str(offer['availability'])?.replace(/^https?:\/\/schema\.org\//, '') ?? null;
    preview.availability = av === 'InStock' ? t('In stock', 'En stock') : av === 'OutOfStock' ? t('Out of stock', 'Rupture de stock') : av === 'PreOrder' ? t('Pre-order', 'Précommande') : av;
  }
  const faq = ok('faq');
  if (faq) {
    const qs = (Array.isArray(faq['mainEntity']) ? faq['mainEntity'] : [faq['mainEntity']]) as Obj[];
    preview.faq = qs.slice(0, 3).map((q) => ({ q: str(q['name']) ?? '', a: (str(first(q['acceptedAnswer'])?.['text']) ?? '').replace(/<[^>]+>/g, '') }));
  }
  const article = ok('article');
  const event = ok('event');
  if (article) preview.date = fmtDate(article['datePublished'] ?? article['dateModified'], loc);
  if (event) {
    preview.date = fmtDate(event['startDate'], loc);
    const loc2 = first(event['location']);
    preview.extra = str(loc2?.['name']) ?? str(first(loc2?.['address'])?.['addressLocality']) ?? null;
  }
  const recipe = ok('recipe');
  if (recipe && has(recipe, 'totalTime')) preview.extra = String(recipe['totalTime']).replace(/^PT/, '').toLowerCase();
  const withImage = article ?? product ?? recipe ?? event;
  if (withImage) {
    const img = withImage['image'];
    preview.image = typeof img === 'string' ? img : Array.isArray(img) ? (str(img[0]) ?? null) : str(first(img)?.['url']);
  }
  return { items, errors, preview };
}

/** Human name of a kind, for the UI. */
export function richKindLabel(k: RichKind): string {
  switch (k) {
    case 'article':
      return t('Article', 'Article');
    case 'product':
      return t('Product', 'Produit');
    case 'faq':
      return 'FAQ';
    case 'breadcrumb':
      return t('Breadcrumb', 'Fil d’Ariane');
    case 'organization':
      return t('Organization', 'Organisation');
    case 'website':
      return t('Website', 'Site web');
    case 'event':
      return t('Event', 'Événement');
    case 'recipe':
      return t('Recipe', 'Recette');
    case 'localbusiness':
      return t('Local business', 'Commerce local');
    case 'video':
      return t('Video', 'Vidéo');
    case 'howto':
      return 'HowTo';
    case 'review':
      return t('Review', 'Avis');
    default:
      return t('Other', 'Autre');
  }
}
