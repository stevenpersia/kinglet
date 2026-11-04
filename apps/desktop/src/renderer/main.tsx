import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './app.css';
import { resolveLanguage, setLanguage } from '@parakeet/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';

/** The whole interface is rebuilt in the new language when it changes. */
function Root() {
  const lang = resolveLanguage(useStore((s) => s.settings.language), navigator.language);
  setLanguage(lang);
  document.documentElement.lang = lang;
  return <App key={lang} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
