import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopHandler, isAppUrl, isExternalUrl } from '../desktop/protocol.mjs';
import { emptyState, newThought } from '../lib/domain.ts';

const req = (path, method = 'GET', data, origin = 'thought-buffer://app') => new Request(`thought-buffer://app${path}`, { method, headers: { origin, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
test('desktop transport starts fresh, persists separately and supports replacing a connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buffer-desktop-'));
  const assets = join(root, 'assets'), directory = join(root, 'data');
  await mkdir(assets);
  await writeFile(join(assets, 'index.html'), '<h1>Thought Buffer</h1>');
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, authorization: options.headers.Authorization });
    if (url.includes('/models/')) return Response.json({ id: 'gpt-5.6-luna' });
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ questions: ['Why?', 'When?', 'How?'] }) }] }] });
  };
  try {
    let handler = createDesktopHandler({ assets, directory, fetcher });
    assert.equal((await (await handler(req('/api/state'))).json()).data, null);
    assert.equal((await (await handler(req('/api/connection'))).json()).connected, false);
    assert.match(await (await handler(req('/'))).text(), /Thought Buffer/);
    const data = { ...emptyState(), thoughts: [newThought('Desktop test thought')] };
    assert.equal((await handler(req('/api/state', 'PUT', { revision: 0, data }))).status, 200);
    handler = createDesktopHandler({ assets, directory, fetcher });
    assert.equal((await (await handler(req('/api/state'))).json()).data.thoughts[0].original, 'Desktop test thought');
    assert.equal((await handler(req('/api/connection', 'POST', { key: 'test-first' }))).status, 200);
    assert.equal((await handler(req('/api/connection', 'POST', { key: 'test-replacement' }))).status, 200);
    assert.equal(JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')).key, 'test-replacement');
    assert.ok(requests.every(r => r.url.startsWith('https://api.openai.com/')));
    assert.equal(requests.at(-1).authorization, 'Bearer test-replacement');
    assert.equal((await (await handler(req('/api/connection'))).text()).includes('test-replacement'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('desktop rejects foreign origins, host spoofing and paths outside bundled assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buffer-desktop-security-'));
  const assets = join(root, 'assets');
  await mkdir(assets);
  await writeFile(join(root, 'secret.txt'), 'must not be served');
  const handler = createDesktopHandler({ assets, directory: join(root, 'data'), fetcher: () => { throw new Error('No external calls'); } });
  try {
    assert.equal((await handler(req('/api/state', 'PUT', { revision: 0, data: emptyState() }, 'https://untrusted.example'))).status, 403);
    assert.equal((await handler(new Request('thought-buffer://other/api/state'))).status, 403);
    assert.equal((await handler(req('/%2e%2e%2fsecret.txt'))).status, 403);
    assert.equal(isAppUrl('thought-buffer://app.evil/'), false);
    assert.equal(isAppUrl('thought-buffer://user@app/'), false);
    assert.equal(isExternalUrl('https://platform.openai.com/api-keys'), true);
    assert.equal(isExternalUrl('file:///etc/passwd'), false);
    assert.equal(isExternalUrl('https://platform.openai.com.evil/api-keys'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
