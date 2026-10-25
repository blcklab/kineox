import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.KINEOX_DEMO_PORT ?? '8000');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.includes('\\') || path.includes('\0')) throw new Error('Invalid URL');
    if (path === '/') path = '/examples/';
    const fullPath = resolve(root, '.' + path);
    const rel = relative(root, fullPath);
    if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || rel.startsWith('/') || rel.startsWith('\\')) {
      throw new Error('Outside demo root');
    }
    let target = fullPath;
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
    const bytes = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': bytes.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    const code = String(error?.message).includes('Outside demo root') || String(error?.message).includes('Invalid URL') ? 403 : 404;
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(code === 403 ? 'Forbidden' : 'Not found');
  }
});

server.on('error', error => {
  console.error(`Demo server error: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\nKINEOX Demo · http://localhost:${port}/examples/`);
  console.log(`Player         http://localhost:${port}/examples/player/`);
  console.log(`Showcase       http://localhost:${port}/examples/showcase/`);
  console.log(`Customization  http://localhost:${port}/examples/customization.html`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
