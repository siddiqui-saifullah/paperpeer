import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(backendRoot, '..');

// Local settings such as DATABASE_URL. Hosting platforms set real env vars instead.
const envFile = path.join(projectRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// Vercel runs each request in a short-lived function with no lasting disk, so
// files go in the database and each instance holds a single connection.
const serverless = Boolean(process.env.VERCEL);

// Empty means embedded Postgres in dataDir, which needs no account.
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

export const config = {
  port: Number(process.env.PORT || 3000),
  serverless,
  databaseUrl,
  poolMax: Number(process.env.DB_POOL_MAX || (serverless ? 1 : 10)),
  // 'neon' or 'pg'. Default: Neon's serverless driver for neon.tech hosts.
  driver: process.env.DB_DRIVER || undefined,
  // Test only: send Neon driver traffic to local stand-ins for Neon's proxies.
  neonLocal: process.env.NEON_FETCH_ENDPOINT
    ? { fetchEndpoint: process.env.NEON_FETCH_ENDPOINT, wsProxy: process.env.NEON_WS_PROXY }
    : undefined,
  // Where uploaded files go: 'cloudinary' (needs CLOUDINARY_URL), 'db' (Postgres)
  // or 'disk' (dataDir). Shared storage is the default whenever it is set up,
  // so every machine using the same database sees the same files.
  storage: process.env.STORAGE || (process.env.CLOUDINARY_URL ? 'cloudinary' : databaseUrl ? 'db' : 'disk'),
  cloudinary: { url: process.env.CLOUDINARY_URL || '', apiBase: process.env.CLOUDINARY_API_BASE || undefined },
  // Serverless functions can only write to the system temp folder.
  dataDir: path.resolve(process.env.DATA_DIR || (serverless ? path.join(os.tmpdir(), 'paperpeer') : path.join(projectRoot, 'data'))),
  // The frontend has its own server on its own port. Set SERVE_FRONTEND=1 to serve
  // both from this one process, which suits a single-server deployment.
  frontendDir: process.env.SERVE_FRONTEND === '1' ? path.join(projectRoot, 'frontend') : null,
  secureCookies: serverless || process.env.NODE_ENV === 'production',
  trustProxy: serverless || process.env.TRUST_PROXY === '1',
};
