import { createIcon } from './create-icon.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Build this package on an Apple silicon Mac.');
const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const electronVersion = '42.0.0';
const name = `electron-v${electronVersion}-darwin-arm64.zip`;
const base = `https://github.com/electron/electron/releases/download/v${electronVersion}`;
const work = join(root, 'work/mac-package');
const output = join(root, 'outputs/releases');
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(output, { recursive: true });
const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
};
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
const [archive, checksums] = await Promise.all([download(`${base}/${name}`), download(`${base}/SHASUMS256.txt`)]);
const expected = checksums.toString('utf8').split('\n').map(l => l.trim().split(/\s+/)).find(parts => parts[1]?.replace(/^\*/, '') === name)?.[0];
if (!expected || createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Electron download checksum mismatch');
await writeFile(join(work, name), archive);
run('/usr/bin/ditto', ['-x', '-k', join(work, name), join(work, 'electron')]);
const app = join(work, 'Thought Buffer.app');
await rename(join(work, 'electron/Electron.app'), app);
const contents = join(app, 'Contents');
await rm(join(contents, 'Resources/default_app.asar'), { force: true });
await cp(join(root, 'work/desktop-app'), join(contents, 'Resources/app'), { recursive: true });
await cp(join(work, 'electron/LICENSE'), join(contents, 'Resources/Electron-LICENSE'));
await cp(join(work, 'electron/LICENSES.chromium.html'), join(contents, 'Resources/LICENSES.chromium.html'));
await createIcon(work, join(contents, 'Resources/electron.icns'));
const plist = join(contents, 'Info.plist');
for (const [key, value] of Object.entries({ CFBundleName: 'Thought Buffer', CFBundleDisplayName: 'Thought Buffer', CFBundleIdentifier: 'com.corvinus2003.thoughtbuffer', CFBundleExecutable: 'ThoughtBuffer', CFBundleShortVersionString: version, CFBundleVersion: version })) {
  run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
}
await rename(join(contents, 'MacOS/Electron'), join(contents, 'MacOS/ThoughtBuffer'));
// Ad-hoc signing is for this private family build. It is not Developer ID signing or notarization.
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
// Run the installed executable against temporary data, then package that tested build.
run(join(contents, 'MacOS/ThoughtBuffer'), ['--smoke-test'], { timeout: 90000 });
const imageRoot = join(work, 'image');
await mkdir(imageRoot);
await cp(app, join(imageRoot, 'Thought Buffer.app'), { recursive: true, verbatimSymlinks: true });
await symlink('/Applications', join(imageRoot, 'Applications'));
await cp(join(root, 'desktop/INSTALL.txt'), join(imageRoot, 'READ ME.txt'));
const dmg = join(output, `Thought-Buffer-${version}-apple-silicon.dmg`);
run('/usr/bin/hdiutil', ['create', '-volname', 'Thought Buffer', '-srcfolder', imageRoot, '-ov', '-format', 'UDZO', dmg]);
run('/usr/bin/hdiutil', ['verify', dmg]);
const checksum = createHash('sha256').update(await readFile(dmg)).digest('hex');
await writeFile(`${dmg}.sha256`, `${checksum}  Thought-Buffer-${version}-apple-silicon.dmg\n`);
console.log(`Created and verified: ${dmg}`);
