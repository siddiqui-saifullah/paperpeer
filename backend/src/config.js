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
  // 'disk' keeps uploads in dataDir; 'db' keeps them in Postgres. A hosted
  // database defaults to 'db', so every machine using it sees the same files.
  storage: process.env.STORAGE || (databaseUrl ? 'db' : 'disk'),
  // Serverless functions can only write to the system temp folder.
  dataDir: path.resolve(process.env.DATA_DIR || (serverless ? path.join(os.tmpdir(), 'paperpeer') : path.join(projectRoot, 'data'))),
  // The frontend has its own server on its own port. Set SERVE_FRONTEND=1 to serve
  // both from this one process, which suits a single-server deployment.
  frontendDir: process.env.SERVE_FRONTEND === '1' ? path.join(projectRoot, 'frontend') : null,
  secureCookies: serverless || process.env.NODE_ENV === 'production',
  trustProxy: serverless || process.env.TRUST_PROXY === '1',
};
