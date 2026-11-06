import { renderToString } from 'react-dom/server';
import { App } from './App';
import { Thanks } from './Thanks';

/** Static HTML of the page, so robots, link previews and Kinglet's own checks read it without JavaScript. */
export function render(): string {
  return renderToString(<App />);
}

/** /thanks: the page after paying, static (no JavaScript). */
export function renderThanks(): string {
  return renderToString(<Thanks />);
}
