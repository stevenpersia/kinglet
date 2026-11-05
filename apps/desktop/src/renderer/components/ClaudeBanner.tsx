import { t } from '@kinglet/core';
import { activeProject } from '../../shared/projects';
import { projectStatus } from '../lib/status';
import { useNow } from '../lib/useNow';
import { api, claudeOpen, projectVercel, useStore } from '../store';
import { StatusDot } from './TitleBar';

const action = (primary = false) =>
  `inline-flex h-6 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap ${primary ? 'bg-fg text-bg' : 'border border-[#2a2a2f] text-fg hover:border-line-strong'}`;

/**
 * When Claude works on, waits on, or finished the active project, or its build fails: at the top of the Claude
 * column when it is unfolded, else one line under the toolbar.
 */
export function ClaudeBanner({ inPanel = false }: { inPanel?: boolean }) {
  const s = useStore();
  const now = useNow(15_000);
  const project = activeProject(s.settings);
  if (!project || s.section === 'projets') return null;
  if (!inPanel && claudeOpen(s)) return null;
  const st = projectStatus(s.claude[project.id], projectVercel(s, project.id).deployments, now);
  if (st.kind === 'idle' || st.kind === 'building') return null;
  const bg = { working: 'rgba(217,119,87,0.08)', waiting: 'rgba(230,192,123,0.07)', review: 'rgba(237,237,239,0.04)', error: 'rgba(242,139,130,0.07)' }[st.kind];
  const latest = projectVercel(s, project.id).deployments[0];
  return (
    <div
      role="status"
      className={`flex shrink-0 items-center border-b border-line-soft ${inPanel ? 'flex-wrap gap-x-2.5 gap-y-1.5 px-4 py-2 text-xs' : 'h-9 gap-3 px-3.5 text-[12.5px]'}`}
      style={{ background: bg }}
    >
      <StatusDot kind={st.kind} color={st.color} size={8} />
      <span className="shrink-0 font-medium text-fg">{st.kind === 'working' ? (inPanel ? t('Working', 'Au travail') : t('Claude is working on this project', 'Claude travaille sur ce projet')) : st.label}</span>
      <span className="min-w-0 flex-1 truncate text-muted">{st.kind === 'working' ? t(`for ${st.short}`, `depuis ${st.short}`) + (st.detail ? ` · ${st.detail}` : '') : (st.detail ?? '')}</span>
      <span className="flex shrink-0 gap-1.5">
        {st.kind === 'review' && (
          <>
            <button className={action(true)} onClick={() => void api().reload()}>
              {t('Reload', 'Recharger')}
            </button>
            <button className={action()} onClick={() => api().claude.markSeen(project.id)}>
              {t('Mark as seen', 'Marquer comme vu')}
            </button>
          </>
        )}
        {st.kind === 'error' && latest?.inspectorUrl && (
          <button className={action()} onClick={() => api().openExternal(latest.inspectorUrl!)}>
            {t('Vercel log', 'Log Vercel')}
          </button>
        )}
        {(st.kind === 'working' || st.kind === 'waiting') && (
          <button className={action()} onClick={() => s.setSection('projets')}>
            {t('See activity', 'Voir l’activité')}
          </button>
        )}
      </span>
    </div>
  );
}
