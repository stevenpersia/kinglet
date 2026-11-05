#!/usr/bin/env node
// Development entry: `claude mcp add kinglet -- node /path/to/kinglet/packages/mcp/src/cli.ts`
import { startStdio } from './stdio.ts';

startStdio().catch((e) => {
  process.stderr.write(`kinglet-mcp: ${(e as Error).stack}\n`);
  process.exit(1);
});
