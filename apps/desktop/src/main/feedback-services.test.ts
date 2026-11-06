import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }));

const { LinearService } = await import('./linear');
const { setLanguage } = await import('@kinglet/core');
setLanguage('fr');

const dir = mkdtempSync(join(tmpdir(), 'kinglet-linear-'));
let server: Server;
let base = '';
const seen: { auth?: string; body: { query: string; variables: Record<string, unknown> } }[] = [];
let uploaded: { type?: string; bytes: number } | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'PUT') {
        uploaded = { type: req.headers['content-type'], bytes: Buffer.concat(chunks).length };
        res.end();
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { query: string; variables: Record<string, unknown> };
      seen.push({ auth: req.headers.authorization, body });
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization !== 'lin_api_good') {
        res.statusCode = 400;
        res.end(JSON.stringify({ errors: [{ message: 'Authentication required, not authenticated', extensions: { type: 'authentication error', code: 'AUTHENTICATION_ERROR' } }] }));
        return;
      }
      if (body.query.includes('viewer')) res.end(JSON.stringify({ data: { viewer: { name: 'Léa', email: 'lea@example.com' }, teams: { nodes: [{ id: 't1', key: 'WEB', name: 'Web' }] } } }));
      else if (body.query.includes('fileUpload')) res.end(JSON.stringify({ data: { fileUpload: { success: true, uploadFile: { uploadUrl: `${base}/upload`, assetUrl: 'https://uploads.linear.app/x/pin-1.jpg', headers: [{ key: 'x-goog-meta-a', value: 'b' }] } } } }));
      else if (body.query.includes('issueCreate')) res.end(JSON.stringify({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/acme/issue/WEB-12' } } } }));
      else res.end(JSON.stringify({ errors: [{ message: 'unknown' }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Linear service', () => {
  it('refuses a bad key, keeps a good one, uploads captures and opens the issue', async () => {
    const states: unknown[] = [];
    const linear = new LinearService(dir, (s) => states.push(s), `${base}/graphql`);
    const bad = await linear.connect('lin_api_bad');
    expect(bad).toMatchObject({ connected: false, error: 'Linear refuse cette clé d’API.' });
    expect(existsSync(join(dir, 'linear.json'))).toBe(false);

    const ok = await linear.connect(' lin_api_good ');
    expect(ok).toMatchObject({ connected: true, user: { name: 'Léa' }, teams: [{ key: 'WEB' }] });
    expect(seen.at(-1)?.auth).toBe('lin_api_good');
    expect(readFileSync(join(dir, 'linear.json'), 'utf8')).toContain('"encrypted":false');

    const urls = await linear.uploadImages([{ name: 'pin-1.jpg', dataUrl: `data:image/jpeg;base64,${Buffer.from('jpeg!').toString('base64')}` }, { name: 'x', dataUrl: 'not a data url' }]);
    expect(urls).toEqual(['https://uploads.linear.app/x/pin-1.jpg', '']);
    expect(uploaded).toEqual({ type: 'image/jpeg', bytes: 5 });

    await expect(linear.createIssue('gone', 'T', 'B')).rejects.toThrow(/n’existe plus/);
    expect(await linear.createIssue('t1', 'Retours · 1 point', 'corps')).toBe('https://linear.app/acme/issue/WEB-12');
    expect(seen.at(-1)?.body.variables).toEqual({ input: { teamId: 't1', title: 'Retours · 1 point', description: 'corps' } });

    linear.disconnect();
    expect(existsSync(join(dir, 'linear.json'))).toBe(false);
  });
});
