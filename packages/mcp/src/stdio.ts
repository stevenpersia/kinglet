import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createParakeetServer } from './server.ts';

/** Run the MCP server over stdio (how Claude Code launches it). Nothing else may write to stdout. */
export async function startStdio(version?: string) {
  const server = createParakeetServer({ version });
  await server.connect(new StdioServerTransport());
}
