import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const apiSrc = readFileSync(join(root, 'backend', 'api.mjs'), 'utf8');

const assets = {};
for (const entry of readdirSync(distDir)) {
  const full = join(distDir, entry);
  if (entry === 'server' || statSync(full).isDirectory()) continue;
  assets['/' + entry] = readFileSync(full, 'utf8');
}
assets['/'] = assets['/index.html'];

const workerFooter = `
const ASSETS=${JSON.stringify(assets)};
export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path.startsWith('/api/'))return api(request,env,ctx);const asset=ASSETS[path];if(asset===undefined)return new Response('Not found',{status:404});const type=path.endsWith('.css')?'text/css':/\\.(mjs|js)$/.test(path)?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'text/html';return new Response(asset,{headers:{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}});},async scheduled(event,env,ctx){ctx.waitUntil(dispatch(env));}};
`;

mkdirSync(join(distDir, 'server'), { recursive: true });
const outPath = join(distDir, 'server', 'index.js');
writeFileSync(outPath, apiSrc + '\n' + workerFooter, 'utf8');
console.log(`Built ${outPath} (${Object.keys(assets).length} assets)`);
