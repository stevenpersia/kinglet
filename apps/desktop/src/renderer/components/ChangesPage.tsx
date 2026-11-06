import { t } from '@kinglet/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangedFile, WorkingChanges } from '../../shared/types';
import { activeProject } from '../../shared/projects';
import { api, cleanError, useStore } from '../store';
import { Icon } from './Icons';

const STATUS: Record<ChangedFile['status'], { label: [string, string]; color: string }> = {
  M: { label: ['Modified', 'Modifié'], color: 'text-preview' },
  A: { label: ['Added', 'Ajouté'], color: 'text-ok' },
  '?': { label: ['New, not tracked', 'Nouveau, non suivi'], color: 'text-ok' },
  D: { label: ['Deleted', 'Supprimé'], color: 'text-err' },
  R: { label: ['Renamed', 'Renommé'], color: 'text-local' },
};

/**
 * What Claude (or you) changed in the project folder since the last commit: look before asking
 * Claude to commit and push. Refreshes on its own while shown, and when Claude finishes.
 */
export function ChangesPage() {
  const s = useStore();
  const project = activeProject(s.settings);
  const status = project ? s.claude[project.id]?.status : undefined;
  const [data, setData] = useState<WorkingChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!project?.folder) return;
    setLoading(true);
    try {
      setData(await api().projects.changes(project.id));
      setError(null);
    } catch (e) {
      setError(cleanError(e));
    }
    setLoading(false);
  }, [project?.id, project?.folder]);

  useEffect(() => {
    setData(null);
    setSelected(null);
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);
  // Claude just finished or waits for an answer: its edits are on disk.
  useEffect(() => {
    if (status && status !== 'working') void load();
  }, [status, load]);

  const files = data?.files ?? [];
  const file = files.find((f) => f.path === selected) ?? files[0] ?? null;
  const totals = useMemo(() => files.reduce((a, f) => ({ added: a.added + f.added, removed: a.removed + f.removed }), { added: 0, removed: 0 }), [files]);

  const header = (
    <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-5 py-3">
      <div className="min-w-0">
        <h1 className="m-0 text-base font-semibold tracking-[-0.01em]">{t('Changes', 'Modifications')}</h1>
        <p className="m-0 mt-0.5 truncate text-xs text-faint">
          {data?.repo
            ? files.length
              ? `${data.branch ?? 'HEAD'} · ${t(`${files.length} file${files.length > 1 ? 's' : ''}`, `${files.length} fichier${files.length > 1 ? 's' : ''}`)} · `
              : `${data.branch ?? 'HEAD'} · ${t('nothing changed since the last commit', 'rien de modifié depuis le dernier commit')}`
            : t('Uncommitted changes in the project folder', 'Modifications non commitées dans le dossier du projet')}
          {data?.repo && files.length > 0 && (
            <>
              <span className="text-ok">+{totals.added}</span> <span className="text-err">−{totals.removed}</span>
            </>
          )}
        </p>
      </div>
      <span className="flex-1" />
      <button onClick={() => void load()} disabled={loading || !project?.folder} title={t('Refresh', 'Actualiser')} aria-label={t('Refresh', 'Actualiser')} className="flex size-8 items-center justify-center rounded-md text-faint hover:bg-active hover:text-fg disabled:opacity-50">
        <Icon name="reload" size={13} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (!project) body = <Empty>{t('Open a project first.', 'Ouvre d’abord un projet.')}</Empty>;
  else if (!project.folder) body = <Empty>{t('Choose the project folder in the Claude column to see its changes.', 'Choisis le dossier du projet dans la colonne Claude pour voir ses modifications.')}</Empty>;
  else if (error) body = <Empty error>{error}</Empty>;
  else if (!data) body = <Empty>{t('Reading the changes…', 'Lecture des modifications…')}</Empty>;
  else if (data.error === 'git') body = <Empty error>{t('git isn’t installed on this computer.', 'git n’est pas installé sur cet ordinateur.')}</Empty>;
  else if (!data.repo) body = <Empty>{t('This folder isn’t a git repository.', 'Ce dossier n’est pas un dépôt git.')}</Empty>;
  else if (!files.length) body = <Empty>{t('Nothing to review: the folder matches the last commit.', 'Rien à relire : le dossier correspond au dernier commit.')}</Empty>;
  else
    body = (
      <div className="flex min-h-0 flex-1">
        <ul aria-label={t('Changed files', 'Fichiers modifiés')} className="m-0 w-[280px] shrink-0 list-none overflow-y-auto border-r border-line-soft p-1.5">
          {files.map((f) => {
            const on = f.path === file?.path;
            const slash = f.path.lastIndexOf('/');
            return (
              <li key={f.path}>
                <button
                  onClick={() => setSelected(f.path)}
                  aria-current={on ? 'true' : undefined}
                  title={`${STATUS[f.status].label[0]} · ${f.oldPath ? `${f.oldPath} → ` : ''}${f.path}`}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${on ? 'bg-raised text-fg' : 'text-muted hover:bg-active'}`}
                >
                  <span className={`w-3 shrink-0 font-mono text-[11px] font-semibold ${STATUS[f.status].color}`}>{f.status === '?' ? 'U' : f.status}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {f.path.slice(slash + 1)}
                    {slash > 0 && <span className="ml-1.5 text-ghost">{f.path.slice(0, slash)}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px]">
                    {f.added > 0 && <span className="text-ok">+{f.added}</span>} {f.removed > 0 && <span className="text-err">−{f.removed}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {file && <Diff file={file} />}
      </div>
    );

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg">
      {header}
      {body}
    </main>
  );
}

function Empty({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <p className={`m-6 text-sm ${error ? 'text-err' : 'text-faint'}`}>{children}</p>;
}

function Diff({ file }: { file: ChangedFile }) {
  return (
    <section aria-label={file.path} className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line-soft px-4 py-2 font-mono text-xs">
        <span className={STATUS[file.status].color}>{t(...STATUS[file.status].label)}</span>
        <span className="min-w-0 truncate text-fg">
          {file.oldPath && <span className="text-faint">{file.oldPath} → </span>}
          {file.path}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[1.55]">
        {file.binary ? (
          <p className="m-4 font-sans text-faint">{t('Binary file: no text diff.', 'Fichier binaire : pas de diff texte.')}</p>
        ) : !file.lines.length ? (
          <p className="m-4 font-sans text-faint">{t('No line changed (mode or empty file).', 'Aucune ligne modifiée (droits ou fichier vide).')}</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {file.lines.map((l, i) =>
                l.kind === 'hunk' ? (
                  <tr key={i} className="bg-[rgba(138,180,248,0.07)] text-local/80">
                    <td colSpan={3} className="px-3 py-0.5 whitespace-pre">{l.text}</td>
                  </tr>
                ) : (
                  <tr key={i} className={l.kind === 'add' ? 'bg-[rgba(125,211,168,0.09)]' : l.kind === 'del' ? 'bg-[rgba(242,139,130,0.09)]' : ''}>
                    <td className="w-[1%] px-2 text-right whitespace-nowrap text-ghost select-none">{l.old ?? ''}</td>
                    <td className="w-[1%] px-2 text-right whitespace-nowrap text-ghost select-none">{l.new ?? ''}</td>
                    <td className={`pr-4 whitespace-pre ${l.kind === 'add' ? 'text-[#b5ebcf]' : l.kind === 'del' ? 'text-[#f6b8b2]' : 'text-muted'}`}>
                      <span className="inline-block w-4 select-none">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
                      {l.text}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
        {file.truncated && <p className="m-4 font-sans text-xs text-faint">{t('Long diff: the rest is cut. Open the file in your editor to see it all.', 'Diff long : la suite est coupée. Ouvre le fichier dans ton éditeur pour tout voir.')}</p>}
      </div>
    </section>
  );
}
