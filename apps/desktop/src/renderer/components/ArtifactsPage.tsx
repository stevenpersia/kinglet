import { t } from '@kinglet/core';
import { useEffect, useRef, useState } from 'react';
import type { ArtifactEntry } from '../../shared/types';
import { activeProject } from '../../shared/projects';
import { useNow } from '../lib/useNow';
import { api, useStore } from '../store';
import { Icon } from './Icons';

const ago = (at: number, now: number) => {
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return t('just now', 'à l’instant');
  if (m < 60) return t(`${m} min ago`, `il y a ${m} min`);
  const h = Math.round(m / 60);
  return h < 24 ? t(`${h} h ago`, `il y a ${h} h`) : new Date(at).toLocaleDateString();
};

type Picked = { selector: string; tag: string; text: string };

/**
 * The pages Claude publishes with its Artifact tool (seen through the Claude Code hooks): listed per project,
 * shown here for real (scripts run, controls work), on the devices in one click, and pointable like the site:
 * pick an element, tell Claude what to change.
 */
export function ArtifactsPage() {
  const s = useStore();
  const project = activeProject(s.settings);
  const list = project ? (s.artifacts[project.id] ?? []) : [];
  const selId = project ? s.artifactSel[project.id] : undefined;
  const current = list.find((a) => a.id === selId) ?? list[0] ?? null;
  const now = useNow();

  // Looked at: no longer new.
  useEffect(() => {
    if (project && current && !current.seen) api().artifacts.seen(project.id, current.id);
  }, [project?.id, current?.id, current?.version, current?.seen]);

  if (!project) return <main className="stage-bg flex-1" />;

  const hooksOff = s.claudeHooks && !s.claudeHooks.installed;
  return (
    <main className="flex min-w-0 flex-1">
      <aside aria-label={t('Artifacts of this project', 'Artifacts de ce projet')} className="flex w-[270px] shrink-0 flex-col border-r border-line-soft bg-chrome">
        <div className="flex flex-col gap-0.5 px-4 pt-4 pb-2.5">
          <h1 className="m-0 text-base font-semibold tracking-[-0.01em]">Artifacts</h1>
          <p className="m-0 text-xs text-faint">{t('Pages Claude published in this project', 'Pages publiées par Claude dans ce projet')}</p>
        </div>
        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-2">
          {list.map((a) => (
            <li key={a.id} className="group relative">
              <button
                onClick={() => s.openArtifact(project.id, a.id)}
                aria-current={a.id === current?.id ? 'true' : undefined}
                className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left ${a.id === current?.id ? 'border-line-strong bg-active' : 'border-transparent hover:bg-active/60'}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised text-faint">
                  <Icon name={a.file ? 'artifact' : 'globe'} size={15} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 pr-5 text-[13px] font-medium">
                    <span className="truncate">{a.title}</span>
                    {!a.seen && <span aria-label={t('new', 'nouveau')} className="size-1.5 shrink-0 rounded-full bg-[#d97757]" />}
                  </span>
                  <span className="truncate font-mono text-[11px] text-faint">
                    v{a.version} · {ago(a.at, now)}
                    {!a.file && ' · claude.ai'}
                  </span>
                </span>
              </button>
              <button
                onClick={async () => useStore.setState({ artifacts: await api().artifacts.remove(project.id, a.id) })}
                aria-label={t(`Remove ${a.title} from the list`, `Retirer ${a.title} de la liste`)}
                title={t('Remove from the list', 'Retirer de la liste')}
                className="absolute top-2 right-2 hidden size-6 items-center justify-center rounded-md text-faint group-focus-within:flex group-hover:flex hover:bg-raised hover:text-fg"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
        <label className="flex cursor-pointer items-start gap-2.5 border-t border-line-soft px-4 py-3 text-xs leading-snug text-muted">
          <input type="checkbox" checked={s.settings.artifactsAutoOpen} onChange={(e) => void s.updateSettings({ artifactsAutoOpen: e.target.checked })} className="mt-0.5 accent-[#d97757]" />
          <span>{t('Show each new artifact as soon as Claude publishes it', 'Afficher chaque nouvel artifact dès que Claude le publie')}</span>
        </label>
      </aside>

      {current ? <Viewer key={current.id} projectId={project.id} artifact={current} /> : <Empty hooksOff={!!hooksOff} />}
    </main>
  );
}

function Empty({ hooksOff }: { hooksOff: boolean }) {
  const s = useStore();
  return (
    <section className="stage-bg flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Icon name="artifact" size={28} className="text-faint" />
      <h2 className="m-0 text-[15px] font-semibold">{hooksOff ? t('Turn on Claude Code tracking', 'Active le suivi de Claude Code') : t('No artifact yet', 'Pas encore d’artifact')}</h2>
      <p className="m-0 max-w-[420px] text-[13px] leading-relaxed text-muted">
        {hooksOff
          ? t('Kinglet sees the artifacts Claude publishes through the Claude Code hooks. Turn them on in the settings, then ask Claude for an artifact.', 'Kinglet voit les artifacts que Claude publie grâce aux hooks de Claude Code. Active-les dans les réglages, puis demande un artifact à Claude.')
          : t('Ask Claude for an artifact (a page, a mock-up, a diagram): it shows up here as soon as it is published, ready to use.', 'Demande un artifact à Claude (une page, une maquette, un schéma) : il s’affiche ici dès sa publication, prêt à servir.')}
      </p>
      {hooksOff && (
        <button onClick={() => s.openSettings('claude')} className="h-8 rounded-ui border border-line-strong bg-raised px-3 text-[13px] font-medium hover:bg-active">
          {t('Open the Claude settings', 'Ouvrir les réglages Claude')}
        </button>
      )}
    </section>
  );
}

function Viewer({ projectId, artifact }: { projectId: string; artifact: ArtifactEntry }) {
  const s = useStore();
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [pointing, setPointing] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void api()
      .artifacts.url(artifact.id)
      .then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [artifact.id]);

  // The page answers a pick with the element clicked (see PICKER_SCRIPT).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.kinglet !== 'picked') return;
      setPicked({ selector: String(e.data.selector ?? ''), tag: String(e.data.tag ?? ''), text: String(e.data.text ?? '') });
      setPointing(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ kinglet: 'pick', on: pointing }, '*');
  }, [pointing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setPointing(false), setPicked(null));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const name = artifact.file?.split('/').pop() ?? artifact.title;
  const ask = () => {
    if (!picked) return;
    const where = artifact.file ?? artifact.url ?? artifact.title;
    s.askClaude(
      `${t(`In the artifact “${artifact.title}” (${where}), this element: ${picked.selector}`, `Dans l’artifact « ${artifact.title} » (${where}), cet élément : ${picked.selector}`)}${picked.text ? ` « ${picked.text} »` : ''}. ${message.trim() || ''}${artifact.url ? t(' Publish it again when done.', ' Republie-le une fois fini.') : ''}`.trim(),
    );
    setPicked(null);
    setMessage('');
  };
  const onDevices = () => {
    if (!src) return;
    void s.navigate(src);
    s.setSection('apercu');
  };
  const copy = () => {
    if (!artifact.url) return;
    void navigator.clipboard.writeText(artifact.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const tool = 'flex h-8 items-center gap-1.5 rounded-ui border px-2.5 text-[13px] disabled:opacity-50';
  return (
    <section aria-label={artifact.title} className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-2">
        <h2 className="m-0 truncate text-sm font-semibold">{artifact.title}</h2>
        <span className="rounded-full border border-line-strong px-2 py-px font-mono text-[11px] text-muted">v{artifact.version}</span>
        <span className="flex-1" />
        {artifact.file && (
          <>
            <button onClick={onDevices} disabled={!src} className={`${tool} border-line text-muted hover:bg-active hover:text-fg`}>
              <Icon name="devices" size={14} />
              {t('On the devices', 'Sur les appareils')}
            </button>
            <button
              onClick={() => (setPicked(null), setPointing((p) => !p))}
              aria-pressed={pointing}
              className={`${tool} ${pointing ? 'border-local bg-local/10 text-local' : 'border-line text-muted hover:bg-active hover:text-fg'}`}
            >
              <Icon name="target" size={14} />
              {t('Point', 'Pointer')}
            </button>
          </>
        )}
        {artifact.url && (
          <>
            <button onClick={copy} aria-label={t('Copy the link', 'Copier le lien')} title={copied ? t('Copied', 'Copié') : t('Copy the link', 'Copier le lien')} className={`${tool} w-8 justify-center border-line text-muted hover:bg-active hover:text-fg`}>
              <Icon name={copied ? 'check' : 'link'} size={14} />
            </button>
            <button onClick={() => api().openExternal(artifact.url!)} className={`${tool} border-line text-muted hover:bg-active hover:text-fg`}>
              {t('Open on claude.ai', 'Ouvrir sur claude.ai')}
              <Icon name="share" size={13} />
            </button>
          </>
        )}
      </div>

      <div className="stage-bg flex min-h-0 flex-1 justify-center overflow-auto p-6">
        {artifact.file ? (
          <div className="flex w-full max-w-[1100px] flex-col overflow-hidden rounded-[10px] border border-line-strong bg-white shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="flex h-[30px] shrink-0 items-center gap-2 border-b border-line bg-active px-3 font-mono text-[11px] text-faint">
              <span className="size-2 rounded-full bg-line-strong" aria-hidden="true" />
              <span className="truncate">{name}</span>
              <span className="ml-auto">{t('local · interactive', 'local · interactif')}</span>
            </div>
            {src && (
              <iframe
                ref={frame}
                key={artifact.version}
                src={src}
                title={artifact.title}
                // Its own origin, no access to Kinglet: scripts and forms work, nothing else.
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
                onLoad={() => frame.current?.contentWindow?.postMessage({ kinglet: 'pick', on: pointing }, '*')}
                className="min-h-0 w-full flex-1 border-0 bg-white"
              />
            )}
          </div>
        ) : (
          <div className="flex max-w-[420px] flex-col items-center justify-center gap-3 self-center text-center">
            <Icon name="globe" size={26} className="text-faint" />
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              {t('This artifact has no local page (a deck, a design, a document made from a type): it opens on claude.ai.', 'Cet artifact n’a pas de page locale (une présentation, un design, un document fait depuis un modèle) : il s’ouvre sur claude.ai.')}
            </p>
            {artifact.url && (
              <button onClick={() => api().openExternal(artifact.url!)} className="h-8 rounded-ui border border-line-strong bg-raised px-3 text-[13px] font-medium hover:bg-active">
                {t('Open on claude.ai', 'Ouvrir sur claude.ai')}
              </button>
            )}
          </div>
        )}
      </div>

      {artifact.file &&
        (picked ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
            className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line-soft bg-chrome px-4 py-2.5"
          >
            <Icon name="target" size={13} className="shrink-0 text-local" />
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-xs text-fg">{picked.tag}</span>
              {picked.text && <span className="max-w-[220px] truncate text-xs text-muted">« {picked.text} »</span>}
              <span className="truncate font-mono text-[10.5px] text-faint">{picked.selector}</span>
            </span>
            <label className="flex min-w-[220px] flex-1">
              <span className="sr-only">{t('Message for Claude', 'Message pour Claude')}</span>
              <input
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('Tell Claude what to change here…', 'Dis à Claude quoi changer ici…')}
                className="h-8 flex-1 rounded-ui border border-line-strong bg-card px-3 text-[13px] text-fg placeholder:text-faint focus:border-local focus:outline-none"
              />
            </label>
            <button type="submit" className="h-8 rounded-ui border border-[rgba(217,119,87,0.45)] bg-[rgba(217,119,87,0.08)] px-3 text-[13px] font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]">
              {t('Ask Claude', 'Demander à Claude')}
            </button>
          </form>
        ) : (
          <p className="m-0 shrink-0 border-t border-line-soft bg-chrome px-4 py-3 text-xs text-faint">
            {pointing ? t('Click an element of the artifact (Esc to cancel).', 'Clique un élément de l’artifact (Échap pour annuler).') : t('“Point”, then click an element of the artifact, to talk about it with Claude.', '« Pointer », puis clique un élément de l’artifact, pour en parler à Claude.')}
          </p>
        ))}
    </section>
  );
}
