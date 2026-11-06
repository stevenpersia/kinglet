/**
 * What a site built in a hurry (or by an AI) tends to leave behind: filler text, fake contact
 * details, links that go nowhere, demo images, a frozen copyright year, missing legal pages.
 * Pure functions: the text, links and images come from the raw HTML (parseMeta) or from the
 * rendered page (a device).
 */
import { t } from './i18n.ts';

export interface PageContent {
  /** Visible text of the body (scripts and styles left out), whitespace collapsed, capped. */
  text: string;
  /** Links of the page: raw href, resolved URL (null when it cannot be resolved), link text. */
  anchors: { href: string; url: string | null; text: string }[];
  /** Image URLs (src, first srcset candidate, resolved). */
  images: string[];
}

export interface ContentFinding {
  /** What was found, quoted from the page. */
  sample: string;
  /** Why it looks like a leftover. */
  why: string;
}

export interface ContentScan {
  /** Lorem ipsum, "Your Company", TODO… */
  filler: ContentFinding[];
  /** Lorem ipsum found: the strongest sign the page is not finished. */
  lorem: boolean;
  /** example.com e-mails, 555 phone numbers, "123 Main Street"… */
  contacts: ContentFinding[];
  /** href="#", javascript:void(0), example.com, bare social network home pages. */
  links: ContentFinding[];
  /** Images from placeholder services (placehold.co, picsum…). */
  images: ContentFinding[];
  /** Year of the copyright notice (the last one when it is a range), null when there is none. */
  copyrightYear: number | null;
  /** Legal pages linked from the page. */
  legal: { notice: boolean; privacy: boolean; terms: boolean };
}

export const MAX_CONTENT_TEXT = 100_000;

const LOREM = /\b(lorem ipsum|dolor sit amet|consectetur adipiscing|sed do eiusmod|ut labore et dolore)\b/i;

/** Filler phrases, English and French. Word boundaries keep "Acme" out of "Acmeist", etc. */
const FILLER: { re: RegExp; why: [string, string] }[] = [
  { re: /\b(your|my) (company|business|brand|startup)( name)?\b|\bcompany name\b|\bnom de (la )?(société|l[’']entreprise|marque)\b|\bvotre (entreprise|société|marque)\b/i, why: ['placeholder company name', 'nom d’entreprise générique'] },
  { re: /\bacme( (inc|corp|co)\.?)?\b/i, why: ['“Acme”, the usual made-up company', '« Acme », l’entreprise inventée habituelle'] },
  { re: /\b(john|jane) (doe|smith)\b|\bjean dupont\b|\bmarie dupont\b|\byour name\b|\bvotre nom\b/i, why: ['made-up person', 'personne inventée'] },
  { re: /\[(your|insert|add|votre|insérer|ajouter)[^\]]{0,40}\]|\{\{\s*[\w.]+\s*\}\}/i, why: ['template slot left unfilled', 'emplacement de modèle non rempli'] },
  { re: /\b(TODO|FIXME|TBD|XXX)\b/, why: ['note left in the text', 'note restée dans le texte'] },
  { re: /\b(insert|add) (your )?(text|content|description|image|logo) here\b|\b(texte|contenu|description) (à venir|ici)\b|\bplaceholder text\b|\btexte de remplissage\b/i, why: ['placeholder text', 'texte de remplissage'] },
];

const FAKE_EMAIL = /\b[\w.+-]+@(example\.(com|org|net|fr)|(your|my)(domain|company|site|email)\.\w+|domain\.com|company\.com|email\.com|test\.com|votredomaine\.\w+|votresite\.\w+|entreprise\.(com|fr))\b|\b(you|your\.?name|john\.?doe|jane\.?doe|name|email|prenom\.nom|jean\.dupont)@[\w-]+\.\w+\b/i;

const FAKE_PHONE: RegExp[] = [
  /(?<![\d-])(\+?1[\s.-]?)?\(?555\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/, // US fiction numbers
  /\b(\+?1[\s.-]?)?\(?123\)?[\s.-]?456[\s.-]?7890\b/,
  /(\+33[\s.]?|\b0)[1-9]([\s.]?)23\2?45\2?67\2?89\b/, // 01 23 45 67 89, +33 1 23 45 67 89
  /(\+33[\s.]?|\b0)6([\s.]?)12\2?34\2?56\2?78\b/, // 06 12 34 56 78
  /\+\d{1,3}[\s.]?(123[\s.]?456[\s.]?789|000[\s.]?000[\s.]?000)\b/,
  /\b0{2}[\s.]?0{2}[\s.]?0{2}[\s.]?0{2}[\s.]?0{2}\b/,
];

const FAKE_ADDRESS = /\b(123|1234) (main|fake|example|any) (st|street|ave|avenue|road)\b|\b123 rue (de la paix|exemple|de l[’']exemple|imaginaire)\b|\b(anytown|anyville|springfield, usa)\b/i;

/** Placeholder image services: the real image was never added. */
const PLACEHOLDER_IMAGES = /^(https?:)?\/\/([\w-]+\.)?(placehold\.co|placehold\.it|placeholder\.com|via\.placeholder\.com|placekitten\.com|placeimg\.com|picsum\.photos|dummyimage\.com|loremflickr\.com|lorempixel\.com|fakeimg\.pl|source\.unsplash\.com|placebear\.com|baconmockup\.com|placeholder\.pics)\//i;

/** Social network home pages: the footer icon was never pointed at the real account. */
const SOCIAL_HOME = /^https?:\/\/(www\.)?(twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|github\.com|youtube\.com|tiktok\.com|pinterest\.com|dribbble\.com|behance\.net|threads\.net|bsky\.app|discord\.com|t\.me)\/?(#.*)?$/i;

const LEGAL_NOTICE = /mentions[\s-]l[ée]gales|legal[\s-]notice|\bimprint\b|\bimpressum\b|\blegal\b|aviso[\s-]legal|note[\s-]legali/i;
const PRIVACY = /confidentialit[ée]|privacy|vie[\s-]priv[ée]e|donn[ée]es[\s-]personnelles|\brgpd\b|\bgdpr\b|datenschutz|privacidad|cookies?[\s-](policy|politique)|politique[\s-](des[\s-])?cookies/i;
const TERMS = /\bcgu\b|\bcgv\b|conditions[\s-](g[ée]n[ée]rales|d[’'\s-]utilisation)|terms|\btos\b|\bagb\b/i;

const quote = (s: string, max = 60) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** The text around a match, so the finding can be found on the page. */
const around = (text: string, index: number, length: number) => quote(text.slice(Math.max(0, index - 15), index + length + 25), 70);

function findAll(text: string, re: RegExp, max = 3): { index: number; match: string }[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const g = new RegExp(re.source, flags);
  const out: { index: number; match: string }[] = [];
  for (let m = g.exec(text); m && out.length < max; m = g.exec(text)) {
    out.push({ index: m.index, match: m[0] });
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

export function scanContent(content: PageContent): ContentScan {
  const why = (w: [string, string]) => t(w[0], w[1]);
  const text = content.text.slice(0, MAX_CONTENT_TEXT);

  const filler: ContentFinding[] = [];
  const lorem = LOREM.test(text);
  if (lorem) {
    const m = findAll(text, LOREM, 1)[0]!;
    filler.push({ sample: around(text, m.index, m.match.length), why: why(['Lorem ipsum', 'Lorem ipsum']) });
  }
  for (const f of FILLER) for (const m of findAll(text, f.re, 2)) filler.push({ sample: around(text, m.index, m.match.length), why: why(f.why) });

  const contacts: ContentFinding[] = [];
  const mailtos = content.anchors.filter((a) => /^mailto:/i.test(a.href)).map((a) => a.href.replace(/^mailto:/i, '').split('?')[0]!);
  const tels = content.anchors.filter((a) => /^tel:/i.test(a.href)).map((a) => decodeURIComponent(a.href.replace(/^tel:/i, '')));
  const seen = new Set<string>();
  const addContact = (sample: string, w: [string, string]) => {
    const k = sample.toLowerCase().replace(/\s+/g, '');
    if (seen.has(k) || contacts.length >= 6) return;
    seen.add(k);
    contacts.push({ sample: quote(sample), why: why(w) });
  };
  for (const m of findAll(text, FAKE_EMAIL, 3)) addContact(m.match, ['example e-mail address', 'adresse e-mail d’exemple']);
  for (const mail of mailtos) if (new RegExp(`^(${FAKE_EMAIL.source})$`, 'i').test(mail)) addContact(mail, ['example e-mail address (mailto)', 'adresse e-mail d’exemple (mailto)']);
  for (const re of FAKE_PHONE) {
    for (const m of findAll(text, re, 2)) addContact(m.match, ['made-up phone number', 'numéro de téléphone inventé']);
    for (const tel of tels) if (re.test(tel)) addContact(tel, ['made-up phone number (tel:)', 'numéro de téléphone inventé (tel:)']);
  }
  for (const m of findAll(text, FAKE_ADDRESS, 2)) addContact(around(text, m.index, m.match.length), ['made-up address', 'adresse inventée']);

  const links: ContentFinding[] = [];
  const linkSeen = new Set<string>();
  const addLink = (a: PageContent['anchors'][number], w: [string, string]) => {
    const label = quote(a.text || a.href, 40);
    const k = `${label}|${a.href}`;
    if (linkSeen.has(k)) return;
    linkSeen.add(k);
    links.push({ sample: `${label} → ${quote(a.href, 50) || '""'}`, why: why(w) });
  };
  for (const a of content.anchors) {
    const href = a.href.trim();
    if (href === '#' || href === '') addLink(a, ['link that goes nowhere', 'lien qui ne mène nulle part']);
    else if (/^javascript:\s*(void\s*\(?0\)?|;)?\s*;?$/i.test(href)) addLink(a, ['link that goes nowhere', 'lien qui ne mène nulle part']);
    else if (/^https?:\/\/(www\.)?(example\.(com|org|net)|yourdomain\.\w+|yoursite\.\w+|votredomaine\.\w+|votresite\.\w+)(\/|$)/i.test(href)) addLink(a, ['link to an example domain', 'lien vers un domaine d’exemple']);
    else if (SOCIAL_HOME.test(href)) addLink(a, ['social network home page, not an account', 'accueil du réseau social, pas un compte']);
  }

  const images: ContentFinding[] = [];
  for (const src of new Set(content.images)) if (PLACEHOLDER_IMAGES.test(src) && images.length < 5) images.push({ sample: quote(src, 70), why: why(['placeholder image service', 'service d’images de remplissage']) });

  // Copyright: "© 2023", "Copyright 2021-2024", "© 2022 – 2023 Acme".
  let copyrightYear: number | null = null;
  for (const m of findAll(text, /(?:©|\(c\)|copyright)\s*(?:[^\d\n]{0,20}?)((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/i, 5)) {
    const parts = m.match.match(/(19|20)\d{2}/g) ?? [];
    const y = Math.max(...parts.map(Number));
    if (Number.isFinite(y)) copyrightYear = Math.max(copyrightYear ?? 0, y);
  }

  const linkText = (a: PageContent['anchors'][number]) => `${a.text} ${a.href}`;
  const legal = {
    notice: content.anchors.some((a) => LEGAL_NOTICE.test(linkText(a))),
    privacy: content.anchors.some((a) => PRIVACY.test(linkText(a))),
    terms: content.anchors.some((a) => TERMS.test(linkText(a))),
  };

  return { filler: filler.slice(0, 6), lorem, contacts, links: links.slice(0, 8), images, copyrightYear, legal };
}

/** The findings, one line each, for Claude. */
export function contentPrompt(scan: ContentScan): string[] {
  const lines: string[] = [];
  for (const f of scan.filler) lines.push(`- Filler text (${f.why}): “${f.sample}”`);
  for (const f of scan.contacts) lines.push(`- Fake contact detail (${f.why}): ${f.sample}`);
  for (const f of scan.links) lines.push(`- Link (${f.why}): ${f.sample}`);
  for (const f of scan.images) lines.push(`- Image (${f.why}): ${f.sample}`);
  return lines;
}
