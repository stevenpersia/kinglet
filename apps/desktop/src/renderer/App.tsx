import { ChangesPage } from './components/ChangesPage';
import { useEffect } from 'react';
import { SidePanel } from './components/Inspector';
import { Palette } from './components/Palette';
import { PhoneDialog } from './components/PhoneDialog';
import { ChecksPage } from './components/Sections';
import { SecurityPage } from './components/SecurityPage';
import { PagePage } from './components/PagePage';
import { ComparePage, DeploymentsPage } from './components/VercelPages';
import { SettingsPage } from './components/SettingsPage';
import { SharePage } from './components/SharePage';
import { Rail } from './components/Sidebar';
import { ClaudeBanner } from './components/ClaudeBanner';
import { ClaudeColumn } from './components/ClaudePanel';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { NewProjectDialog } from './components/NewProject';
import { ProjectsPage } from './components/ProjectsPage';
import { Stage } from './components/Stage';
import { Onboarding } from './components/Onboarding';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { api, claudeShown, useStore } from './store';

/** Read tags and run the checks after a load: always, or only when something on screen shows them. */
function wantsAnalysis() {
  const s = useStore.getState();
  return s.settings.autoAnalyze || s.section === 'checks' || s.section === 'page';
}

export function App() {
  const { ready, section } = useStore();
  const withClaude = useStore(claudeShown);
  const onboarded = useStore((s) => s.settings.onboarded);

  useEffect(() => {
    const store = useStore.getState();
    const off = api().onEvent((e) => {
      const s = useStore.getState();
      switch (e.type) {
        case 'loading':
          useStore.setState({ status: 'loading', error: null, perf: {}, forms: null, ...(useStore.getState().settings.autoAnalyze ? {} : { report: null, share: null }) });
          break;
        case 'loaded':
          useStore.setState({ status: 'loaded', url: e.url, error: null });
          // Let late scripts run (and log their errors) before measuring the rendered page.
          setTimeout(() => {
            if (useStore.getState().url === e.url && wantsAnalysis()) void useStore.getState().analyze(e.url);
            void useStore.getState().crawlSite();
          }, 700);
          // Thumbnail of the project for the overview.
          setTimeout(async () => {
            const id = useStore.getState().settings.activeId;
            const thumb = id && useStore.getState().section === 'apercu' ? await api().thumbnail() : null;
            if (thumb && id && id === useStore.getState().settings.activeId) useStore.setState((st) => ({ thumbs: { ...st.thumbs, [id]: thumb } }));
          }, 1500);
          break;
        case 'failed':
          useStore.setState({ status: 'failed', error: e.error, share: null, report: null });
          break;
        case 'navigated':
          useStore.setState({ url: e.url });
          // Client-side route change (SPA): no new load event, analyse the new route.
          if (s.status === 'loaded' && e.url !== s.url) {
            // The previous route's report no longer applies.
            if (!wantsAnalysis()) useStore.setState({ report: null, share: null });
            setTimeout(() => wantsAnalysis() && void useStore.getState().analyze(e.url), 700);
          }
          break;
        case 'window':
          useStore.setState({ maximized: e.maximized });
          break;
        case 'settings':
          useStore.setState({ settings: e.settings });
          break;
        case 'mcp':
          s.pushMcpActivity(e.activity);
          break;
        case 'vercel':
          useStore.setState({ vercel: e.state });
          break;
        case 'phone':
          useStore.setState({ phone: e.state });
          break;
        case 'update':
          useStore.setState({ update: e.state });
          break;
        case 'logs':
          useStore.setState((st) => ({ logs: [...st.logs.filter((l) => !e.cleared.includes(l.deviceId)), ...e.entries].slice(-1500) }));
          break;
        case 'perf':
          useStore.setState((st) => ({ perf: { ...st.perf, [e.perf.deviceId]: e.perf } }));
          break;
        case 'claude':
          useStore.setState({ claude: e.projects });
          break;
        case 'github':
          useStore.setState({ github: e.state });
          break;
        case 'dev': {
          const was = s.dev[e.projectId]?.status;
          useStore.setState((st) => ({ dev: { ...st.dev, [e.projectId]: e.state } }));
          // The dev server of the project shown is up: show the site.
          if (e.state.status === 'running' && was !== 'running' && e.state.url && s.settings.activeId === e.projectId) void s.navigate(s.url && s.status === 'loaded' && new URL(s.url).origin === new URL(e.state.url).origin ? s.url : e.state.url);
          break;
        }
        case 'inspect':
          useStore.setState({ inspect: e.state });
          break;
        case 'audit':
          useStore.setState({ auditProgress: { done: e.done, queued: e.queued, external: !!e.external } });
          break;
        case 'taborder':
          useStore.setState({ tabInfo: e.devices });
          break;
        case 'history':
          useStore.setState((st) => ({ histories: { ...st.histories, [e.projectId]: e.entries } }));
          break;
        case 'feedback':
          useStore.setState((st) => ({ pins: { ...st.pins, [e.projectId]: e.pins } }));
          break;
        case 'review':
          useStore.setState({ review: e.state });
          break;
        case 'shortcut':
          if (e.action === 'reload') void api().reload();
          else if (e.action === 'focus-url') useStore.setState({ urlFocusTick: s.urlFocusTick + 1 });
          else if (e.action === 'palette') useStore.setState({ paletteOpen: !s.paletteOpen });
          else if (e.action === 'settings') s.setSection('reglages');
          else if (e.action === 'toggle-landscape') void s.updateSettings({ landscape: !s.settings.landscape });
          else if (e.action === 'toggle-scroll-sync') void s.updateSettings({ scrollSync: !s.settings.scrollSync });
          else if (e.action === 'claude') s.settings.claudePanel && s.toggleClaude();
          else if (e.action === 'switcher') useStore.setState({ switcherOpen: !s.switcherOpen, paletteOpen: false });
          else if (e.action === 'overview') s.setSection(s.section === 'projets' ? 'apercu' : 'projets');
          else if (e.action.startsWith('tab-')) {
            const id = s.settings.openIds[Number(e.action.slice(4)) - 1];
            if (id) {
              void s.selectProject(id);
              if (s.section === 'projets') s.setSection('apercu');
            }
          }
          break;
      }
    });
    void store.init().then(async () => {
      await store.loadMcp();
      const claude = await api().claude.state();
      useStore.setState({ logs: await api().logs() });
      useStore.setState({ vercel: await api().vercel.state(), update: await api().update.state(), claude: claude.projects, claudeHooks: claude.hooks, github: await api().github.state(), review: await api().review.state(), dev: await api().dev.all() });
    });
    return off;
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <ClaudeBanner />
      <div className="flex min-h-0 flex-1">
        {section !== 'projets' && <Rail />}
        {!ready ? (
          <main className="stage-bg flex-1" />
        ) : section === 'apercu' ? (
          <>
            {/* Opened from the left bar: right next to it, like the settings navigation. */}
            <SidePanel />
            <Stage />
          </>
        ) : section === 'projets' ? (
          <ProjectsPage />
        ) : section === 'partage' ? (
          <SharePage />
        ) : section === 'checks' ? (
          <ChecksPage />
        ) : section === 'securite' ? (
          <SecurityPage />
        ) : section === 'page' ? (
          <PagePage />
        ) : section === 'reglages' ? (
          <SettingsPage />
        ) : section === 'deploiements' ? (
          <DeploymentsPage />
        ) : section === 'changes' ? (
          <ChangesPage />
        ) : (
          <ComparePage />
        )}
        {/* Claude on the right: open by default, it stays in place across the sections. */}
        {ready && withClaude && <ClaudeColumn />}
      </div>
      <StatusBar />
      <Palette />
      <ProjectSwitcher />
      <NewProjectDialog />
      <PhoneDialog />
      {ready && !onboarded && <Onboarding />}
    </div>
  );
}
