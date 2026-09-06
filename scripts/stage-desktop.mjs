import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const stage = join(root, 'work/desktop-app');
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, 'desktop'), { recursive: true });
await mkdir(join(stage, 'lib'));
// Explicit allowlist. Never copy the project directory or its .local folder.
for (const name of ['main.mjs', 'protocol.mjs', 'smoke.mjs'])
  await cp(join(root, 'desktop', name), join(stage, 'desktop', name));
await cp(join(root, 'lib/local-api.mjs'), join(stage, 'lib/local-api.mjs'));
await cp(join(root, 'work/desktop-renderer'), join(stage, 'renderer'), {
  recursive: true,
});
const { version } = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
);
await writeFile(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'thought-buffer',
      productName: 'Thought Buffer',
      version,
      type: 'module',
      main: 'desktop/main.mjs',
      description: 'Turn one thought into a concrete next step.',
    },
    null,
    2,
  ),
);
const forbidden =
  /^(\.local|\.env.*|connection\.json|buffer(?:\.previous)?\.json|node_modules)$/;
async function audit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || forbidden.test(entry.name))
      throw new Error('Private or unexpected file in desktop package');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await audit(path);
    else if (/\.(mjs|js|json|html|css)$/.test(path)) {
      const text = await readFile(path, 'utf8');
      if (
        /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
          text,
        )
      )
        throw new Error('Credential-like content in desktop package');
    }
  }
}
await audit(stage);
console.log(`Desktop source staged and audited: ${stage}`);
