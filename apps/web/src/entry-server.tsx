import { renderToString } from 'react-dom/server';
import { App } from './App';

/** Static HTML of the page, so robots, link previews and Kinglet's own checks read it without JavaScript. */
export function render(): string {
  return renderToString(<App />);
}
