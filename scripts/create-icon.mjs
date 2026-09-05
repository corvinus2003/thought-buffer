import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Rasterize the existing bracket favicon for the Dock; no external icon asset.
export async function createIcon(work, destination) {
  const size = 1024, scanlines = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = (x + 0.5) / 16, b = (y + 0.5) / 16;
    const dx = Math.max(15 - a, a - 49, 0), dy = Math.max(15 - b, b - 49, 0);
    const inside = dx * dx + dy * dy <= 225;
    const left = a >= 13.5 && a <= 18.5 && b >= 13.5 && b <= 50.5;
    const right = a >= 45.5 && a <= 50.5 && b >= 13.5 && b <= 50.5;
    const horizontal = ((a >= 16 && a <= 25) || (a >= 39 && a <= 48)) && ((b >= 13.5 && b <= 18.5) || (b >= 45.5 && b <= 50.5));
    const white = left || right || horizontal;
    const i = y * (1 + size * 4) + 1 + x * 4;
    scanlines.set(white ? [255, 255, 255, 255] : [41, 93, 220, inside ? 255 : 0], i);
  }
  const crc = bytes => {
    let c = 0xffffffff;
    for (const b of bytes) { c ^= b; for (let n = 0; n < 8; n++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const label = Buffer.from(type), len = Buffer.alloc(4), checksum = Buffer.alloc(4);
    len.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([label, data])));
    return Buffer.concat([len, label, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const png = join(work, 'icon.png');
  await writeFile(png, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]));
  const iconset = join(work, 'ThoughtBuffer.iconset'); await mkdir(iconset);
  const run = (cmd, args) => { const result = spawnSync(cmd, args, { stdio: 'pipe' }); if (result.status !== 0) throw new Error('Icon conversion failed'); };
  for (const n of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) run('/usr/bin/sips', ['-z', String(n * scale), String(n * scale), png, '--out', join(iconset, `icon_${n}x${n}${scale === 2 ? '@2x' : ''}.png`)]);
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', destination]);
}
