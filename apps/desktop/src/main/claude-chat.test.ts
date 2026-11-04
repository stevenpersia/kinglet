import { describe, expect, it } from 'vitest';
import { findClaude, toolLabel } from './claude-chat';

describe('Claude chat', () => {
  it('turns tool calls into short lines', () => {
    expect(toolLabel('mcp__parakeet__screenshot', { device: 'iphone-se' })).toEqual({ name: 'screenshot', detail: 'iphone-se' });
    expect(toolLabel('Edit', { file_path: 'src/Header.tsx', old_string: 'a' })).toEqual({ name: 'Edit', detail: 'src/Header.tsx' });
    expect(toolLabel('Bash', { command: 'x'.repeat(200) }).detail).toHaveLength(91);
    expect(toolLabel('mcp__parakeet__set_devices', { ids: ['iphone-se', 'ipad-air'] }).detail).toBe('iphone-se, ipad-air');
  });

  it('finds Claude Code from PARAKEET_CLAUDE_BIN, else nothing on an empty PATH', () => {
    expect(findClaude({ PARAKEET_CLAUDE_BIN: '/definitely/missing/claude' })).toBeNull();
    expect(findClaude({ PARAKEET_CLAUDE_BIN: process.execPath })).toBe(process.execPath);
  });
});
