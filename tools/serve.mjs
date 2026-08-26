#!/usr/bin/env node
// Zero-dependency preview server. Mirrors the .htaccess routing rules so that
// local behaviour matches HostGator: extensionless URLs resolve to .html, and
// unknown paths render 404.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(pathname) {
  const candidates = pathname.endsWith('/')
    ? [join(pathname, 'index.html')]
    : [pathname, `${pathname}.html`, join(pathname, 'index.html')];
  for (const candidate of candidates) {
    const abs = join(ROOT, decodeURIComponent(candidate));
    if (!abs.startsWith(ROOT)) continue; // path traversal guard
    try {
      if ((await stat(abs)).isFile()) return abs;
    } catch {
      // try next candidate
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const file = await resolveFile(pathname === '/' ? '/index.html' : pathname);

  if (file === null) {
    const body = await readFile(join(ROOT, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(body);
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  res.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`preview  http://localhost:${PORT}`);
});
