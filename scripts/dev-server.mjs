import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const publicDir = join(root, 'public');
const port = Number(process.env.PORT ?? 8787);

const envFile = join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) {
    const name = pathname.slice('/api/'.length).replace(/[^a-z]/g, '');
    const file = join(root, 'api', `${name}.js`);
    if (!existsSync(file)) {
      res.statusCode = 404;
      return res.end('{"error":"Nepoznata putanja"}');
    }
    req.body = await readJson(req);
    const { default: handler } = await import(pathToFileURL(file).href);
    return handler(req, res);
  }
  const target = normalize(join(publicDir, pathname === '/' ? 'index.html' : pathname));
  if (!target.startsWith(publicDir) || !existsSync(target)) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('content-type', CONTENT_TYPES[extname(target)] ?? 'application/octet-stream');
  return res.end(readFileSync(target));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
