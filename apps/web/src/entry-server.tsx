import { renderToString } from 'react-dom/server';
import { App } from './App';
import { LEGAL_PAGES } from './Legal';
import { Thanks } from './Thanks';

/** Static HTML of the page, so robots, link previews and Kinglet's own checks read it without JavaScript. */
export function render(): string {
  return renderToString(<App />);
}

/** /thanks: the page after paying, static (no JavaScript). */
export function renderThanks(): string {
  return renderToString(<Thanks />);
}

/** The legal pages (/legal, /terms, /privacy), static too. */
export const legalPages = LEGAL_PAGES.map(({ path, title, description, Page }) => ({ path, title, description, html: () => renderToString(<Page />) }));

export { missingPublisherFields } from './publisher';
