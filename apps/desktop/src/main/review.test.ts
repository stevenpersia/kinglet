import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FeedbackPin, ReviewState } from '../shared/types';
import { ReviewServer } from './review';

const dir = mkdtempSync(join(tmpdir(), 'kinglet-review-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PIXEL = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

describe('review link', () => {
  let pins: FeedbackPin[] = [{ id: 'p1', n: 1, deviceId: 'iphone-16', deviceLabel: 'iPhone 16', url: 'http://localhost:5173/', x: 10, y: 20, selector: 'h1', elementText: 'Titre', comment: 'Plus gros', image: `data:image/jpeg;base64,${PIXEL.toString('base64')}`, createdAt: 1, done: false }];
  const states: ReviewState[] = [];
  let server: ReviewServer;

  it('serves the pins and captures, takes replies and new pins, refuses other tokens', async () => {
    server = new ReviewServer({ dir, loadPins: () => structuredClone(pins), savePins: (_id, next) => (pins = next), publicUrl: () => null, onChange: (s) => states.push(s) });
    const st = await server.open('proj', 'Maison Sable', 'http://localhost:5173/', [{ id: 'iphone-16', label: 'iPhone 16', width: 393, height: 852, jpeg: PIXEL }]);
    const link = st.links['proj'];
    expect(link).toMatch(/^http:\/\/[\d.]+:\d+\/r\/[\w-]{20,}$/);
    const local = link!.replace(/^http:\/\/[^/:]+/, 'http://127.0.0.1');
    const page = await fetch(local);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Feedback on Maison Sable');
    const data = (await (await fetch(`${local}/data`)).json()) as { shots: { id: string }[]; pins: { id: string; hasImage: boolean; image?: string }[] };
    expect(data.shots.map((s) => s.id)).toEqual(['iphone-16']);
    expect(data.pins[0]).toMatchObject({ id: 'p1', hasImage: true });
    expect(data.pins[0]!.image).toBeUndefined();
    expect((await fetch(`${local}/pin/p1.jpg`)).headers.get('content-type')).toBe('image/jpeg');
    expect((await fetch(`${local}/shot/iphone-16.jpg`)).status).toBe(200);

    const post = (path: string, body: object) => fetch(`${local}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('/reply', { pinId: 'p1', text: 'D’accord, et en gras ?', author: 'Alex' })).status).toBe(200);
    expect(pins[0]!.replies).toEqual([{ author: 'Alex', text: 'D’accord, et en gras ?', at: expect.any(Number) }]);
    expect((await post('/pin', { shotId: 'iphone-16', fx: 0.5, fy: 0.25, text: 'Ce bouton', author: '' })).status).toBe(200);
    expect(pins[1]).toMatchObject({ n: 2, deviceId: 'iphone-16', x: 197, y: 213, fx: 0.5, fy: 0.25, comment: 'Ce bouton', author: 'Client', done: false });
    expect(pins[1]!.image).toMatch(/^data:image\/jpeg;base64,/);
    expect((await post('/pin', { shotId: 'nope', fx: 0.5, fy: 0.5, text: 'x' })).status).toBe(400);
    expect((await post('/reply', { pinId: 'p1', text: '   ' })).status).toBe(400);

    expect((await fetch(local.replace(/\/r\/.*/, '/r/aaaaaaaaaaaaaaaaaaaaaaaa'))).status).toBe(404);
    const closed = server.close('proj');
    expect(closed.links).toEqual({});
    expect(closed.running).toBe(false);
  });
});
