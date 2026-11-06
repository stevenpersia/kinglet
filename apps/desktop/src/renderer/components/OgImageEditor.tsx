import { OG_LAYOUTS, OG_SIZE, buildOgImageHtml, parseColor, t, toHex, type OgImageInput, type OgLayout } from '@kinglet/core';
import { useEffect, useState } from 'react';
import type { OgImageDraft, OgImageSaved } from '../../shared/types';
import { api, cleanError, useStore } from '../store';
import { Icon } from './Icons';

const OPEN_EVENT = 'kinglet:og-image-editor';

/** Opens the share image editor for the page shown (from the Partage page or a check). */
export function openOgImageEditor() {
  const s = useStore.getState();
  if (s.section !== 'partage') s.setSection('partage');
  // Let the Partage page mount first.
  setTimeout(() => window.dispatchEvent(new Event(OPEN_EVENT)), 0);
}

const LAYOUT_LABEL = (): Record<OgLayout, string> => ({
  bold: t('Color', 'Couleur'),
  card: t('Card', 'Carte'),
  centered: t('Centered', 'Centré'),
});

const SWATCHES = ['#111113', '#ffffff', '#1d4ed8', '#047857', '#b45309', '#be185d', '#6d28d9'];

const field = 'h-8 min-w-0 rounded-md border border-line bg-bg px-2.5 text-[12.5px] text-fg outline-none focus:border-line-strong';

/** The template drawn at real size, shrunk to `width`. */
function Thumb({ input, width }: { input: OgImageInput; width: number }) {
  const k = width / OG_SIZE.width;
  return (
    <div className="relative shrink-0 overflow-hidden rounded-md shadow-[0_0_0_1px_#2e2e33]" style={{ width, height: Math.round(OG_SIZE.height * k) }}>
      <iframe
        title={t('Share image', 'Image de partage')}
        srcDoc={buildOgImageHtml(input)}
        sandbox=""
        tabIndex={-1}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{ width: OG_SIZE.width, height: OG_SIZE.height, transform: `scale(${k})` }}
      />
    </div>
  );
}

const kb = (b: number) => `${Math.round(b / 1024)} ${t('KB', 'Ko')}`;

/** Mounted on the Partage page: a dialog to make a 1200×630 share image from the page's own data. */
export function OgImageEditorHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  return open ? <OgImageEditor onClose={() => setOpen(false)} /> : null;
}

function OgImageEditor({ onClose }: { onClose: () => void }) {
  const url = useStore((s) => s.url);
  const claude = useStore((s) => s.settings.claudePanel);
  const [draft, setDraft] = useState<OgImageDraft | null>(null);
  const [input, setInput] = useState<OgImageInput | null>(null);
  const [logo, setLogo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<OgImageSaved | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    api()
      .ogImage.draft(url)
      .then((d) => {
        setDraft(d);
        setInput(d.input);
        setLogo(!!d.input.logo);
      })
      .catch((e) => setError(cleanError(e)));
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const final = input ? { ...input, logo: logo ? input.logo : null } : null;
  const set = (p: Partial<OgImageInput>) => {
    setInput((i) => (i ? { ...i, ...p } : i));
    setSaved(null);
  };
  const save = async (choose = false) => {
    if (!final || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api().ogImage.save(final, draft, choose);
      if (r) setSaved(r);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setSaving(false);
    }
  };
  const copy = (what: string, text: string) => {
    api().copy(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const themeColor = draft ? draft.input.color : null;
  const swatches = [...new Set([...(themeColor ? [themeColor] : []), ...SWATCHES])];
  const validColor = input ? toHex(parseColor(input.color) ?? { r: 17, g: 17, b: 19 }) : '#111113';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('Share image', 'Image de partage')} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-[980px] flex-col overflow-hidden rounded-[14px] border border-line bg-card shadow-2xl shadow-black/70">
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{t('Make the share image', 'Générer l’image de partage')}</h2>
            <p className="m-0 text-xs text-muted">
              {t(
                '1200×630, under 300 KB: shown without cropping on WhatsApp, LinkedIn, X, Slack… Made from the page’s title, description, color and icon.',
                '1200×630, moins de 300 Ko : affichée sans recadrage sur WhatsApp, LinkedIn, X, Slack… Faite à partir du titre, de la description, de la couleur et de l’icône de la page.',
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label={t('Close', 'Fermer')} className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg">
            <Icon name="close" size={12} />
          </button>
        </div>

        {!input || !draft || !final ? (
          <p className={`m-0 p-6 text-xs ${error ? 'text-err' : 'text-faint'}`}>{error ?? t('Reading the page…', 'Lecture de la page…')}</p>
        ) : (
          <div className="flex min-h-0 gap-5 overflow-y-auto p-5">
            <div className="flex min-w-0 flex-col gap-3">
              <Thumb input={final} width={600} />
              <div className="flex gap-2" role="radiogroup" aria-label={t('Layout', 'Mise en page')}>
                {OG_LAYOUTS.map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={input.layout === l}
                    onClick={() => set({ layout: l })}
                    className={`flex flex-col gap-1.5 rounded-lg p-1.5 text-left text-[11.5px] ${input.layout === l ? 'bg-active text-fg shadow-[inset_0_0_0_1px_#3a3a40]' : 'text-muted hover:bg-active/60'}`}
                  >
                    <Thumb input={{ ...final, layout: l }} width={186} />
                    <span className="px-0.5">{LAYOUT_LABEL()[l]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex w-[300px] shrink-0 flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="label">{t('Title', 'Titre')}</span>
                <textarea value={input.title} onChange={(e) => set({ title: e.target.value })} rows={2} className={`${field} h-auto resize-none py-1.5`} />
                <span className={`text-[11px] ${input.title.length > 70 ? 'text-warn' : 'text-ghost'}`}>
                  {input.title.length} {t('characters', 'caractères')}
                  {input.title.length > 70 ? t(': short reads better in a thumbnail', ' : court se lit mieux en vignette') : ''}
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">{t('Subtitle', 'Sous-titre')}</span>
                <textarea value={input.subtitle} onChange={(e) => set({ subtitle: e.target.value })} rows={2} className={`${field} h-auto resize-none py-1.5`} />
              </label>
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="label">{t('Site name', 'Nom du site')}</span>
                  <input value={input.siteName} onChange={(e) => set({ siteName: e.target.value })} className={field} />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="label">{t('Domain', 'Domaine')}</span>
                  <input value={input.domain} onChange={(e) => set({ domain: e.target.value })} className={`${field} font-mono text-[11.5px]`} />
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="label">{input.layout === 'card' ? t('Accent color', 'Couleur d’accent') : t('Background', 'Fond')}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {swatches.map((c) => (
                    <button
                      key={c}
                      onClick={() => set({ color: c })}
                      aria-label={c === themeColor ? t(`Site color ${c}`, `Couleur du site ${c}`) : c}
                      title={c === themeColor ? t('theme-color of the site', 'theme-color du site') : c}
                      className={`size-6 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] ${validColor === c.toLowerCase() ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                  <input type="color" value={validColor} onChange={(e) => set({ color: e.target.value })} aria-label={t('Other color', 'Autre couleur')} className="h-6 w-8 cursor-pointer rounded border border-line bg-bg p-0" />
                  <input value={input.color} onChange={(e) => set({ color: e.target.value })} aria-label={t('Color code', 'Code couleur')} className={`${field} h-6 w-[84px] font-mono text-[11px]`} />
                </div>
              </div>
              <label className={`flex items-center gap-2 text-xs ${input.logo ? 'text-muted' : 'text-ghost'}`}>
                <input type="checkbox" checked={logo && !!input.logo} disabled={!input.logo} onChange={() => setLogo(!logo)} className="size-[15px] accent-[#ededef]" />
                {input.logo ? t('Show the site’s icon', 'Afficher l’icône du site') : t('No usable icon found (PNG or SVG)', 'Aucune icône utilisable trouvée (PNG ou SVG)')}
              </label>

              <div className="h-px bg-line-soft" />

              {!saved ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[11.5px] leading-snug text-faint">
                    {draft.targetDir
                      ? t(`Saved as og.png in ${draft.targetDir} (never over an existing file).`, `Enregistrée en og.png dans ${draft.targetDir} (jamais par-dessus un fichier existant).`)
                      : t('No project folder: you choose where to save it.', 'Pas de dossier de projet : tu choisis où l’enregistrer.')}
                  </span>
                  <div className="flex gap-1.5">
                    <button onClick={() => void save(false)} disabled={saving} className="flex h-8 flex-1 items-center justify-center gap-2 rounded-ui bg-fg font-semibold text-bg disabled:opacity-60">
                      <Icon name="download" size={13} />
                      {saving ? t('Saving…', 'Enregistrement…') : draft.targetDir ? t('Save in the project', 'Enregistrer dans le projet') : t('Save…', 'Enregistrer…')}
                    </button>
                    {draft.targetDir && (
                      <button onClick={() => void save(true)} disabled={saving} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong disabled:opacity-60">
                        {t('Elsewhere…', 'Ailleurs…')}
                      </button>
                    )}
                  </div>
                  {error && <span className="text-xs text-err">{error}</span>}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-xs text-fg">
                    <Icon name="check" size={13} className="text-ok" />
                    <span className="min-w-0 truncate font-mono text-[11.5px]" title={saved.path}>
                      {saved.path}
                    </span>
                  </span>
                  <span className="text-[11.5px] text-faint">
                    {saved.format.toUpperCase()}, {kb(saved.bytes)}
                    {saved.format === 'jpg' ? t(' (JPEG: the PNG was over 300 KB)', ' (JPEG : le PNG dépassait 300 Ko)') : ''}
                    {saved.inProject ? t(`, served at ${saved.webPath}`, `, servie à ${saved.webPath}`) : t(' — outside the site’s static folder: move it there', ' — hors du dossier statique du site : déplace-la dedans')}
                  </span>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="label">{t('Tags to add', 'Balises à ajouter')}</span>
                    <span className="truncate pl-3 font-mono text-[11px] text-faint">{saved.tags.file}</span>
                  </div>
                  <pre className="m-0 max-h-40 overflow-auto rounded-[10px] border border-line bg-bg p-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted">{saved.tags.code}</pre>
                  {claude && (
                    <button
                      onClick={() => {
                        useStore.getState().askClaude(saved.tags.prompt);
                        onClose();
                      }}
                      className="flex h-8 items-center justify-center gap-2 rounded-ui border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] text-xs font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]"
                    >
                      <Icon name="spark" size={12} />
                      {t('Ask Claude to wire it in', 'Demander à Claude de la brancher')}
                    </button>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => copy('prompt', saved.tags.prompt)} className="h-8 flex-1 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong">
                      {copied === 'prompt' ? t('Prompt copied ✓', 'Prompt copié ✓') : t('Copy the prompt', 'Copier le prompt')}
                    </button>
                    <button onClick={() => copy('code', saved.tags.code)} className="h-8 rounded-ui border border-[#2a2a2f] bg-active px-3 text-xs font-medium text-fg hover:border-line-strong">
                      {copied === 'code' ? t('Copied ✓', 'Copié ✓') : 'Code'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
