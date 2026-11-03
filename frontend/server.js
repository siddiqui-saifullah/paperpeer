// Serves the browser app on its own port and passes /api on to the backend. The
// browser sees one origin, so login cookies and security rules work without CORS.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.FRONTEND_PORT || 5173);
const backend = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:3000');
const root = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = ['index.html', 'favicon.svg', 'styles', 'js'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

function proxy(req, res) {
  const upstream = http.request(
    {
      hostname: backend.hostname,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress },
    },
    (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'The backend is not running. Start it, then try again.' }));
  });
  req.pipe(upstream);
}

function serveFile(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = path.posix.normalize(pathname === '/' ? '/index.html' : pathname).slice(1);
  const file = path.join(root, relative);
  const allowed = PUBLIC.some((p) => relative === p || relative.startsWith(`${p}/`));
  if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, SECURITY_HEADERS);
    return res.end('Not found');
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) return proxy(req, res);
  try {
    serveFile(req, res);
  } catch {
    res.writeHead(400, SECURITY_HEADERS);
    res.end('Bad request');
  }
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the other server, then try again.` : err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`PaperPeer frontend running at http://localhost:${PORT}`);
});
