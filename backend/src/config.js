import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(backendRoot, '..');

// Local settings such as DATABASE_URL. Hosting platforms set real env vars instead.
const envFile = path.join(projectRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  port: Number(process.env.PORT || 3000),
  // Empty means embedded Postgres in dataDir, which needs no account.
  databaseUrl: process.env.DATABASE_URL || '',
  poolMax: Number(process.env.DB_POOL_MAX || 10),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data')),
  // The frontend has its own server on its own port. Set SERVE_FRONTEND=1 to serve
  // both from this one process, which suits a single-server deployment.
  frontendDir: process.env.SERVE_FRONTEND === '1' ? path.join(projectRoot, 'frontend') : null,
  secureCookies: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === '1',
};
