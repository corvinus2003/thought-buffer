import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
const root = resolve(fileURLToPath(new URL('../', import.meta.url))); 
const url = 'http://127.0.0.1:4319/';
async function health() {
  try {
    const response = await fetch(`${url}api/health`, {
      signal: AbortSignal.timeout(1200),
    });
    const health = await response.json();
    if (!response.ok || health.app !== 'thought-buffer')
      throw new Error('Port 4319 is being used by another application.');
    if (health.projectRoot !== root)
      throw new Error('A different Thought Buffer folder is already running. Close that server before opening this project.');
    return true;
  } catch (e) {
    if (e.message.includes('another application') || e.message.includes('different Thought Buffer')) throw e;
    return false;
  }
}
if (!(await health())) {
  await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
  const log = await open(join(root, '.local/server.log'), 'a', 0o600);
  const child = spawn(
    process.execPath,
    [
      join(root, 'node_modules/vinext/dist/cli.js'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '4319',
    ],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  child.unref();
  await log.close();
  let started = false;
  for (let n = 0; n < 50; n++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (await health()) {
      started = true;
      break;
    }
  }
  if (!started)
    throw new Error(
      `Thought Buffer could not start. Details are saved in ${join(root, '.local/server.log')}.`,
    );
}
if (!process.argv.includes('--no-open')) {
  const browser = spawn('/usr/bin/open', [url], {
    detached: true,
    stdio: 'ignore',
  });
  browser.unref();
}
console.log(`Thought Buffer is ready at ${url}`);
