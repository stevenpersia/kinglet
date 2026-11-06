import { hydrateRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './site.css';

hydrateRoot(document.getElementById('root')!, <App />);
