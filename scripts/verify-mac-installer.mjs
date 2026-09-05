import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat, readdir, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';

const tag = process.argv[2] || 'v0.2.0-mac.1';
const version = process.argv[3] || '0.2.0';
if (!/^v[\w.-]+$/.test(tag) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release');
const work = resolve('work/installer-verification');
await mkdir(work, { recursive: true });
const run = (cmd, args, timeout = 90000) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout });
  if (r.stdout) console.log(r.stdout.trim());
  if (r.stderr) console.log(r.stderr.trim());
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed: ${r.error?.message || r.status}`);
  return r.stdout;
};
const name = `Thought-Buffer-${version}-apple-silicon.dmg`;
const base = `https://github.com/corvinus2003/thought-buffer/releases/download/${tag}/${name}`;
async function download(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const [image, sum] = await Promise.all([download(base), download(`${base}.sha256`)]);
assert.equal(createHash('sha256').update(image).digest('hex'), sum.toString().split(/\s+/)[0]);
const dmg = join(work, name); await writeFile(dmg, image);
run('/usr/bin/hdiutil', ['verify', dmg]);
const mount = join(work, 'mounted'); await mkdir(mount, { recursive: true });
run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
try {
  const mountedApp = join(mount, 'Thought Buffer.app');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', mountedApp]);
  const installed = join(work, 'Applications/Thought Buffer.app');
  await mkdir(join(work, 'Applications'), { recursive: true });
  run('/usr/bin/ditto', [mountedApp, installed]);
  const executable = join(installed, 'Contents/MacOS/ThoughtBuffer');
  assert.ok((await lstat(executable)).mode & 0o111, 'Main executable must be executable');
  let links = 0;
  async function checkLinks(directory) {
    for (const name of await readdir(directory)) {
      const path = join(directory, name), stat = await lstat(path);
      if (stat.isSymbolicLink()) {
        const target = await realpath(path), rel = relative(installed, target);
        assert.ok(!rel.startsWith('..') && !isAbsolute(rel), 'Bundle link must remain inside the installed app');
        links++;
      } else if (stat.isDirectory()) await checkLinks(path);
    }
  }
  await checkLinks(installed);
  console.log(`Verified ${links} bundle symlinks`);
  run('/usr/bin/plutil', ['-lint', join(installed, 'Contents/Info.plist')]);
  for (const key of ['CFBundleExecutable', 'CFBundleIdentifier', 'LSMinimumSystemVersion']) run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(installed, 'Contents/Info.plist')]);
  run('/usr/bin/file', [executable]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', installed]);
  assert.match(run(executable, ['--smoke-test']), /DESKTOP_SMOKE_OK/);
  const stdout = join(work, 'finder.stdout'), stderr = join(work, 'finder.stderr');
  run('/usr/bin/open', ['-n', '-W', '-a', installed, '--stdout', stdout, '--stderr', stderr, '--args', '--smoke-test']);
  const result = await readFile(stdout, 'utf8');
  console.log(result);
  assert.match(result, /DESKTOP_SMOKE_OK/, 'Finder/LaunchServices must complete the app test');
  console.log('DOWNLOADED_INSTALLER_AND_FINDER_LAUNCH_OK');
} finally { run('/usr/bin/hdiutil', ['detach', mount]); }
