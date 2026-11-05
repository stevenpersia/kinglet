import { describe, expect, it } from 'vitest';
import { findClaude } from './claude-cli';

describe('Claude Code', () => {
  it('finds Claude Code from KINGLET_CLAUDE_BIN, else nothing on an empty PATH', () => {
    expect(findClaude({ KINGLET_CLAUDE_BIN: '/definitely/missing/claude' })).toBeNull();
    expect(findClaude({ KINGLET_CLAUDE_BIN: process.execPath })).toBe(process.execPath);
  });
});
