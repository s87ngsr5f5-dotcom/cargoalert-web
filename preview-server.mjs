import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const distDir = join(root, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};
const port = Number(process.env.PORT) || 8787;

http.createServer((req, res) => {
  const urlPath = new URL(req.url, `http://localhost:${port}`).pathname;
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = join(distDir, rel);
  if (!full.startsWith(distDir) || !existsSync(full)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(full)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(readFileSync(full));
}).listen(port, '127.0.0.1', () => {
  console.log(`CargoAlert v3.0 雙感知器網站已啟動（支援藍牙直連！）：`);
  console.log(`  藍牙雙感知器首頁：http://localhost:${port}/`);
  console.log(`  4G 遠端監測＋模擬：http://localhost:${port}/remote.html`);
});
