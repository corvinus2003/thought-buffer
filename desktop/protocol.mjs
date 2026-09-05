import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { createLocalApi } from '../lib/local-api.mjs';

export const APP_URL = 'thought-buffer://app/';
export function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'thought-buffer:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}
export function isExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'platform.openai.com' && url.pathname === '/api-keys' && !url.username && !url.password;
  } catch { return false; }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

export function createDesktopHandler({ assets, directory, fetcher }) {
  // A desktop installation never inherits a developer's environment credential.
  const api = createLocalApi({ directory, fetcher, environmentKey: '' });
  return async (request) => {
    if (!isAppUrl(request.url)) return new Response('Forbidden', { status: 403 });
    const origin = request.headers.get('origin');
    if (origin && origin !== 'thought-buffer://app') return new Response('Forbidden', { status: 403 });
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Internal Request adapter only: no TCP listener or network request is made.
      const headers = new Headers(request.headers);
      headers.set('origin', 'http://127.0.0.1');
      return api(new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
        method: request.method, headers,
        ...(request.body ? { body: request.body, duplex: 'half' } : {}),
      }));
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad path', { status: 400 }); }
    const file = resolve(assets, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rel = relative(assets, file);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || pathname.includes('\0') || pathname.includes('\\')) return new Response('Forbidden', { status: 403 });
    try {
      const bytes = await readFile(file);
      return new Response(request.method === 'HEAD' ? null : bytes, {
        headers: { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
      });
    } catch { return new Response('Not found', { status: 404 }); }
  };
}
