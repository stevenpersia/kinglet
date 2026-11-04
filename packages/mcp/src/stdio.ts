import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setLanguage } from '@parakeet/core';
import { configDir } from './control.ts';
import { createParakeetServer } from './server.ts';

/** Speak the language chosen in Parakeet's settings (English when unknown). */
export function loadLanguage(dir = configDir()) {
  try {
    setLanguage((JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as { language?: string }).language);
  } catch {
    setLanguage('en');
  }
}

/** Run the MCP server over stdio (how Claude Code launches it). Nothing else may write to stdout. */
export async function startStdio(version?: string) {
  loadLanguage();
  const server = createParakeetServer({ version });
  await server.connect(new StdioServerTransport());
}
