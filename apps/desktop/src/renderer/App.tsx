import { useEffect } from 'react';
import { Inspector } from './components/Inspector';
import { Palette } from './components/Palette';
import { PhoneDialog } from './components/PhoneDialog';
import { ChecksPage } from './components/Sections';
import { ComparePage, DeploymentsPage } from './components/VercelPages';
import { SettingsPage } from './components/SettingsPage';
import { SharePage } from './components/SharePage';
import { Rail } from './components/Sidebar';
import { ClaudeBanner } from './components/ClaudeBanner';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { ProjectsPage } from './components/ProjectsPage';
import { Stage } from './components/Stage';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { api, useStore } from './store';

export function App() {
  const { ready, section } = useStore();

  useEffect(() => {
    const store = useStore.getState();
    const off = api().onEvent((e) => {
      const s = useStore.getState();
      switch (e.type) {
        case 'loading':
          useStore.setState({ status: 'loading', error: null });
          break;
        case 'loaded':
          useStore.setState({ status: 'loaded', url: e.url, error: null });
          // Let late scripts run (and log their errors) before measuring the rendered page.
          setTimeout(() => {
            if (useStore.getState().url === e.url) void useStore.getState().analyze(e.url);
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
          if (s.status === 'loaded' && e.url !== s.url) setTimeout(() => void useStore.getState().analyze(e.url), 700);
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
        case 'claude':
          useStore.setState({ claude: e.projects });
          break;
        case 'shortcut':
          if (e.action === 'reload') void api().reload();
          else if (e.action === 'focus-url') useStore.setState({ urlFocusTick: s.urlFocusTick + 1 });
          else if (e.action === 'palette') useStore.setState({ paletteOpen: !s.paletteOpen });
          else if (e.action === 'settings') s.setSection('reglages');
          else if (e.action === 'toggle-landscape') void s.updateSettings({ landscape: !s.settings.landscape });
          else if (e.action === 'toggle-scroll-sync') void s.updateSettings({ scrollSync: !s.settings.scrollSync });
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
      useStore.setState({ vercel: await api().vercel.state(), update: await api().update.state(), claude: claude.projects, claudeHooks: claude.hooks });
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
            <Stage />
            <Inspector />
          </>
        ) : section === 'projets' ? (
          <ProjectsPage />
        ) : section === 'partage' ? (
          <SharePage />
        ) : section === 'checks' ? (
          <ChecksPage />
        ) : section === 'reglages' ? (
          <SettingsPage />
        ) : section === 'deploiements' ? (
          <DeploymentsPage />
        ) : (
          <ComparePage />
        )}
      </div>
      <StatusBar />
      <Palette />
      <ProjectSwitcher />
      <PhoneDialog />
    </div>
  );
}
