#!/usr/bin/env node
// Development entry: `claude mcp add parakeet -- node /path/to/parakeet/packages/mcp/src/cli.ts`
import { startStdio } from './stdio.ts';

startStdio().catch((e) => {
  process.stderr.write(`parakeet-mcp: ${(e as Error).stack}\n`);
  process.exit(1);
});
