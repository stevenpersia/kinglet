import { expect, it, vi } from 'vitest';

vi.mock('zustand', () => ({ create: () => () => ({}) }));
const { cleanError } = await import('../store');

it('keeps only the explanation of an IPC error', () => {
  expect(cleanError(new Error("Error invoking remote method 'share:previews': Error: fetch failed : redirect count exceeded"))).toBe('fetch failed : redirect count exceeded');
  expect(cleanError(new Error("Error invoking remote method 'vercel:connect': VercelError: Vercel token refused."))).toBe('Vercel token refused.');
  expect(cleanError(new Error('plain'))).toBe('plain');
});
