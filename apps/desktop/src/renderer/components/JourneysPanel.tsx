import { describeStep, journeyPrompt, t, type Journey, type JourneyRun } from '@kinglet/core';
import { useEffect, useState } from 'react';
import { activeProject, patchProject } from '../../shared/projects';
import { api, cleanError, useStore } from '../store';
import { Icon } from './Icons';
import { ToolPanel } from './Stage';

const TRIGGER = (): Record<JourneyRun['trigger'], string> => ({
  manual: t('on the devices', 'sur les appareils'),
  claude: t('after Claude', 'après Claude'),
  commit: t('after a commit', 'après un commit'),
  deploy: t('after a deploy', 'après un déploiement'),
});

const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return t('just now', 'à l’instant');
  if (m < 60) return t(`${m} min ago`, `il y a ${m} min`);
  const h = Math.round(m / 60);
  return h < 24 ? t(`${h} h ago`, `il y a ${h} h`) : new Date(at).toLocaleDateString();
};

/**
 * Journeys: record a path once on a device (clicks, typing, navigation), play it on every device,
 * after each Claude task, commit and deploy, or export it as a Playwright test.
 */
export function JourneysPanel() {
  const s = useStore();
  const project = activeProject(s.settings);
  const journeys = project?.journeys ?? [];
  const runs = (project && s.journeyRuns[project.id]) || {};
  const rec = s.journeyRec;
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (project) void api().journeys.runs(project.id).then((r) => useStore.setState((st) => ({ journeyRuns: { ...st.journeyRuns, [project.id]: r } })));
  }, [project?.id]);

  const save = (list: Journey[]) => project && void s.updateSettings(patchProject(s.settings, project.id, { journeys: list }));
  const start = async () => {
    setMessage(null);
    setName(t(`Journey ${journeys.length + 1}`, `Parcours ${journeys.length + 1}`));
    await api().journeys.record();
  };
  const stop = async (keep: boolean) => {
    const j = await api().journeys.stop(keep ? name : null);
    if (j) setOpen(j.id);
  };
  const play = async (j: Journey) => {
    setPlaying(j.id);
    setMessage(null);
    setOpen(j.id);
    try {
      await api().journeys.play(j.id);
    } catch (e) {
      setMessage({ ok: false, text: cleanError(e) });
    } finally {
      setPlaying(null);
      useStore.setState({ journeyProgress: null });
    }
  };
  const exportTest = async (j: Journey) => {
    try {
      const path = await api().journeys.exportPlaywright(j.id);
      if (path) setMessage({ ok: true, text: t(`Test written: ${path}`, `Test écrit : ${path}`) });
    } catch (e) {
      setMessage({ ok: false, text: cleanError(e) });
    }
  };

  const subtitle = rec ? (
    <>
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-err" />
      {t(`Recording · ${rec.steps.length} step${rec.steps.length === 1 ? '' : 's'}`, `Enregistrement · ${rec.steps.length} étape${rec.steps.length > 1 ? 's' : ''}`)}
    </>
  ) : (
    t(`${journeys.length} journey${journeys.length === 1 ? '' : 's'}`, `${journeys.length} parcours`)
  );

  return (
    <ToolPanel tool="journeys" subtitle={subtitle}>
      <div className="flex flex-col gap-3 p-3">
        {rec ? (
          <div className="flex flex-col gap-2.5 rounded-[10px] border border-err/30 bg-err/[0.05] p-3">
            <p className="m-0 text-[12px] leading-normal text-muted">
              {t(
                `Click, type and move around on a device: each step lands here. Starts at ${rec.startPath}.`,
                `Clique, saisis et navigue sur un appareil : chaque étape arrive ici. Départ : ${rec.startPath}.`,
              )}
            </p>
            <StepList steps={rec.steps.map((st) => describeStep(st))} onDrop={(i) => api().journeys.dropStep(i)} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && rec.steps.length && void stop(true)}
              aria-label={t('Journey name', 'Nom du parcours')}
              className="h-8 rounded-md border border-line bg-bg px-2.5 text-[13px] text-fg"
            />
            <div className="flex gap-1.5">
              <button disabled={!rec.steps.length || !name.trim()} onClick={() => void stop(true)} className="flex h-8 flex-1 items-center justify-center gap-2 rounded-ui bg-fg text-xs font-semibold text-bg disabled:opacity-50">
                {t('Save the journey', 'Enregistrer le parcours')}
              </button>
              <button onClick={() => void stop(false)} className="h-8 rounded-ui border border-line px-3 text-xs text-muted hover:border-line-strong hover:text-fg">
                {t('Cancel', 'Annuler')}
              </button>
            </div>
          </div>
        ) : (
          <button disabled={!s.url || !!playing} onClick={() => void start()} className="flex w-full items-center gap-3 rounded-[10px] border border-line-soft bg-[#1a1a1b] px-3.5 py-3 text-left hover:border-line-strong disabled:opacity-50">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-err/10 text-err">
              <Icon name="rec" size={13} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium">{t('Record a journey', 'Enregistrer un parcours')}</span>
              <span className="text-[11.5px] text-faint">{t('Sign up, checkout, contact: do it once on a device.', 'Inscription, achat, contact : fais-le une fois sur un appareil.')}</span>
            </span>
          </button>
        )}

        {message && <p className={`m-0 rounded-md px-2.5 py-2 text-[11.5px] break-words ${message.ok ? 'bg-ok/10 text-ok' : 'bg-err/10 text-err'}`}>{message.text}</p>}

        {journeys.map((j) => (
          <JourneyCard
            key={j.id}
            journey={j}
            run={runs[j.id]}
            open={open === j.id}
            playing={playing === j.id}
            busy={!!playing || !!rec}
            progress={s.journeyProgress?.journeyId === j.id ? s.journeyProgress.steps : null}
            onToggle={() => setOpen(open === j.id ? null : j.id)}
            onPlay={() => void play(j)}
            onExport={() => void exportTest(j)}
            onAuto={(auto) => save(journeys.map((x) => (x.id === j.id ? { ...x, auto } : x)))}
            onDelete={() => save(journeys.filter((x) => x.id !== j.id))}
          />
        ))}

        {!rec && (
          <p className="m-0 px-1 pt-1 text-[11.5px] leading-normal text-faint">
            {journeys.length
              ? t(
                  'Played on every device at once, and off screen (a phone and a screen) after each Claude task, commit and deploy: a notification when one breaks.',
                  'Rejoué sur tous les appareils d’un coup, et hors écran (un téléphone et un écran) après chaque tâche de Claude, commit et déploiement : une notification quand l’un casse.',
                )
              : t('Recorded on one device, played on all of them. Kinglet keeps clicks, typing, Enter and Escape, and the pages they lead to.', 'Enregistré sur un appareil, rejoué sur tous. Kinglet garde les clics, la saisie, Entrée et Échap, et les pages où ils mènent.')}
          </p>
        )}
      </div>
    </ToolPanel>
  );
}

function StepList({ steps, onDrop, status }: { steps: string[]; onDrop?: (i: number) => void; status?: (i: number) => 'ok' | 'fail' | 'now' | null }) {
  if (!steps.length) return <p className="m-0 text-[11.5px] text-faint">{t('No step yet.', 'Aucune étape pour l’instant.')}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
      {steps.map((text, i) => {
        const st = status?.(i) ?? null;
        return (
          <li key={i} className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-active/50">
            <span className={`w-5 shrink-0 text-right font-mono text-[10.5px] ${st === 'fail' ? 'text-err' : st === 'ok' ? 'text-ok' : st === 'now' ? 'text-[#c6f432]' : 'text-ghost'}`}>{st === 'fail' ? '✕' : st === 'ok' ? '✓' : st === 'now' ? '▸' : i + 1}</span>
            <span className={`min-w-0 flex-1 truncate ${st === 'fail' ? 'text-err' : 'text-muted'}`} title={text}>
              {text}
            </span>
            {onDrop && (
              <button onClick={() => onDrop(i)} aria-label={t('Remove this step', 'Retirer cette étape')} className="flex size-5 shrink-0 items-center justify-center rounded text-faint opacity-0 group-hover:opacity-100 hover:text-fg focus:opacity-100">
                <Icon name="close" size={10} />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function JourneyCard(props: {
  journey: Journey;
  run: JourneyRun | undefined;
  open: boolean;
  playing: boolean;
  busy: boolean;
  progress: Record<string, number> | null;
  onToggle(): void;
  onPlay(): void;
  onExport(): void;
  onAuto(auto: boolean): void;
  onDelete(): void;
}) {
  const { journey: j, run, open, playing, progress } = props;
  const claude = useStore((s) => s.settings.claudePanel);
  const [confirm, setConfirm] = useState(false);
  const failed = run?.devices.filter((d) => !d.ok) ?? [];
  const first = failed[0];
  // While playing: the furthest step reached; else the last run, from its first failing device.
  const status = (i: number): 'ok' | 'fail' | 'now' | null => {
    if (playing && progress) {
      const at = Math.max(...Object.values(progress), -1);
      return i < at ? 'ok' : i === at ? 'now' : null;
    }
    if (!run) return null;
    const d = first ?? run.devices[0];
    if (!d) return null;
    if (d.failedAt === i) return 'fail';
    return d.steps[i]?.ok ? 'ok' : null;
  };
  return (
    <section className={`overflow-hidden rounded-[10px] border bg-[#1a1a1b] ${run && !run.ok ? 'border-err/30' : 'border-line-soft'}`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button onClick={props.onToggle} aria-expanded={open} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className="flex max-w-full items-center gap-2 text-[13px] font-medium">
            <span className={`size-2 shrink-0 rounded-full ${!run ? 'bg-ghost' : run.ok ? 'bg-ok' : 'bg-err'}`} />
            <span className="truncate">{j.name}</span>
          </span>
          <span className="max-w-full truncate text-[11px] text-faint">
            {t(`${j.steps.length} steps from ${j.startPath}`, `${j.steps.length} étapes depuis ${j.startPath}`)}
            {run ? ` · ${run.ok ? t('passed', 'réussi') : t(`broke on ${failed.map((d) => d.label).join(', ')}`, `cassé sur ${failed.map((d) => d.label).join(', ')}`)} ${TRIGGER()[run.trigger]}, ${ago(run.at)}` : ''}
          </span>
        </button>
        <button onClick={props.onPlay} disabled={props.busy} title={t('Play on every device', 'Rejouer sur tous les appareils')} className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[rgba(198,244,50,0.12)] px-2.5 text-[11.5px] font-medium text-[#c6f432] hover:bg-[rgba(198,244,50,0.2)] disabled:opacity-50">
          <Icon name={playing ? 'reload' : 'play'} size={11} className={playing ? 'animate-spin' : ''} />
          {playing ? t('Playing', 'En cours') : t('Play', 'Rejouer')}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2.5 border-t border-line-soft p-3">
          <StepList steps={j.steps.map((st) => describeStep(st))} status={status} />
          {run && !run.ok && first && (
            <div className="flex flex-col gap-2 rounded-md border border-err/25 bg-err/[0.05] p-2.5 text-[11.5px]">
              {failed.map((d) => (
                <span key={d.deviceId} className="break-words text-err">
                  <b className="font-medium">{d.label}</b> · {d.failedAt != null && d.failedAt >= 0 ? t(`step ${d.failedAt + 1}`, `étape ${d.failedAt + 1}`) : t('start page', 'page de départ')}
                  {t(': ', ' : ')}
                  {d.error}
                </span>
              ))}
              {first.consoleErrors.length > 0 && <span className="truncate font-mono text-[10.5px] text-muted">console · {first.consoleErrors[0]}</span>}
              {first.screenshot && <img src={first.screenshot} alt={t(`${first.label} when it failed`, `${first.label} au moment de l’échec`)} className="max-h-[260px] w-fit max-w-full self-center rounded border border-line-soft" />}
              {claude && (
                <button
                  onClick={() => useStore.getState().askClaude(`${journeyPrompt(j, run)}\n\n${t('Fix the code so this journey passes on every device, without changing what it does. Then I will play it again.', 'Corrige le code pour que ce parcours passe sur tous les appareils, sans changer ce qu’il fait. Ensuite je le rejoue.')}`)}
                  className="flex h-7 w-fit items-center gap-1.5 rounded-md border border-[rgba(217,119,87,0.35)] bg-[rgba(217,119,87,0.08)] px-2.5 font-semibold text-[#d97757] hover:bg-[rgba(217,119,87,0.14)]"
                >
                  <Icon name="spark" size={11} />
                  {t('Ask Claude', 'Demander à Claude')}
                </button>
              )}
            </div>
          )}
          <label className="flex items-start gap-2 text-[11.5px] text-muted">
            <input type="checkbox" checked={j.auto !== false} onChange={(e) => props.onAuto(e.target.checked)} className="mt-0.5" />
            {t('Play it after each Claude task, commit and deploy', 'Le rejouer après chaque tâche de Claude, commit et déploiement')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={props.onExport} className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[11.5px] text-muted hover:border-line-strong hover:text-fg">
              <Icon name="code" size={11} />
              {t('Playwright test', 'Test Playwright')}
            </button>
            <span className="flex-1" />
            {confirm ? (
              <button onClick={props.onDelete} className="h-7 rounded-md bg-err/15 px-2.5 text-[11.5px] font-medium text-err">
                {t('Delete it', 'Le supprimer')}
              </button>
            ) : (
              <button onClick={() => setConfirm(true)} className="h-7 rounded-md px-2.5 text-[11.5px] text-faint hover:text-err">
                {t('Delete', 'Supprimer')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
