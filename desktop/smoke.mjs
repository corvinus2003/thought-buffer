import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Only run with --smoke-test. main.mjs assigns a new temporary userData directory.
export async function runSmokeTest(window, directory) {
  const evaluate = (fn) =>
    window.webContents.executeJavaScript(`(${fn.toString()})()`);
  assert.equal(
    await evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        if (document.querySelectorAll('textarea').length === 1) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    }),
    true,
    'The single-thought entry screen should render',
  );
  assert.equal(await evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(
    await evaluate(async () => (await fetch('/api/connection')).json()),
    { connected: false, model: 'gpt-5.6-luna' },
  );
  assert.equal(
    (await evaluate(async () => (await fetch('/api/state')).json())).data,
    null,
  );
  assert.equal(
    await evaluate(() => {
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent.includes('Connect Luna'))
        .click();
      return true;
    }),
    true,
  );
  assert.equal(
    await evaluate(async () => {
      for (let i = 0; i < 30; i++) {
        if (document.querySelector('input[type=password]')) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    }),
    true,
    'Connection dialog should expose a masked key field',
  );
  const result = await evaluate(async () => {
    const state = await (await fetch('/api/state')).json();
    const data = {
      version: 2,
      screen: 'entry',
      activeId: null,
      thoughts: [],
      drafts: ['Desktop smoke test'],
      addDraft: '',
    };
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: state.revision, data }),
    });
    return {
      status: response.status,
      state: await (await fetch('/api/state')).json(),
    };
  });
  assert.equal(result.status, 200);
  assert.equal(result.state.data.drafts[0], 'Desktop smoke test');
  assert.equal(
    JSON.parse(await readFile(join(directory, 'buffer.json'), 'utf8')).data
      .drafts[0],
    'Desktop smoke test',
  );
  assert.equal(
    (await stat(join(directory, 'buffer.json'))).mode & 0o777,
    0o600,
  );
  await window.loadURL('thought-buffer://app/');
  assert.equal(
    (await evaluate(async () => (await fetch('/api/state')).json())).data
      .drafts[0],
    'Desktop smoke test',
  );
}
