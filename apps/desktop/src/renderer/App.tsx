import { useEffect } from 'react';
import { Inspector } from './components/Inspector';
import { Palette } from './components/Palette';
import { SharePage, SoonPage } from './components/Sections';
import { Sidebar } from './components/Sidebar';
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
          void s.refreshShare(e.url);
          break;
        case 'failed':
          useStore.setState({ status: 'failed', error: e.error, share: null });
          break;
        case 'navigated':
          useStore.setState({ url: e.url });
          break;
        case 'window':
          useStore.setState({ maximized: e.maximized });
          break;
        case 'shortcut':
          if (e.action === 'reload') void api().reload();
          else if (e.action === 'focus-url') useStore.setState({ urlFocusTick: s.urlFocusTick + 1 });
          else if (e.action === 'palette') useStore.setState({ paletteOpen: !s.paletteOpen });
          else if (e.action === 'settings') s.setSection('reglages');
          else if (e.action === 'toggle-landscape') void s.updateSettings({ landscape: !s.settings.landscape });
          else if (e.action === 'toggle-scroll-sync') void s.updateSettings({ scrollSync: !s.settings.scrollSync });
          break;
      }
    });
    void store.init();
    return off;
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {!ready ? (
          <main className="stage-bg flex-1" />
        ) : section === 'apercu' ? (
          <>
            <Stage />
            <Inspector />
          </>
        ) : section === 'partage' ? (
          <SharePage />
        ) : (
          <SoonPage section={section} />
        )}
      </div>
      <StatusBar />
      <Palette />
    </div>
  );
}
