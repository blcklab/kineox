import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.mp4': 'video/mp4' };
const server = createServer(async (req, res) => {
  const decoded = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const abs = resolve(root, '.' + decoded);
  if (!abs.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const info = await stat(abs);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    const body = await readFile(abs);
    const ext = abs.slice(abs.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': contentTypes[ext] ?? 'application/octet-stream',
      'content-length': body.byteLength });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});

server.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const addr = server.address();
const browser = process.env.CHROME_BINARY || 'chromium';
try {
  const args = [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--virtual-time-budget=12000',
    '--dump-dom', `http://127.0.0.1:${addr.port}/tests/browser.html`
  ];
  const proc = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d; });
  proc.stderr.on('data', d => { stderr += d; });
  const exitCode = await new Promise((done, fail) => {
    const timeout = setTimeout(() => { proc.kill('SIGKILL'); fail(new Error('Chromium browser smoke timed out.')); }, 15000);
    proc.once('error', fail);
    proc.once('exit', code => { clearTimeout(timeout); done(code); });
  });
  const message = stdout.match(/<main id="result">([^<]+)<\/main>/)?.[1] || 'NO RESULT';
  if (exitCode !== 0 || !message.startsWith('PASS |')) {
    console.error(stderr.slice(-900));
    throw new Error(`Browser smoke failed (${exitCode}): ${message}`);
  }
  console.log('Chromium real-media smoke:', message);
} finally {
  server.close();
}
