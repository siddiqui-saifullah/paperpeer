import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CloudinaryConfig, StorageMode } from './types.js';

// The backend folder: the nearest one up with a package.json. Works whether this
// file runs from src/ (tsx) or from the compiled dist/src/.
function findBackendRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find the backend folder.');
    dir = parent;
  }
  return dir;
}

const backendRoot = findBackendRoot();
const projectRoot = path.resolve(backendRoot, '..');

// Local settings such as DATABASE_URL. Hosting platforms set real env vars instead.
const envFile = path.join(projectRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

// Vercel runs each request in a short-lived function with no lasting disk, so
// each instance holds a single connection and writes only to the temp folder.
const serverless = Boolean(env.VERCEL);

// Empty means embedded Postgres in dataDir, which needs no account.
const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || '';

const storageModes: StorageMode[] = ['disk', 'db', 'cloudinary'];
function storageMode(): StorageMode {
  const chosen = env.STORAGE as StorageMode | undefined;
  if (chosen && !storageModes.includes(chosen)) throw new Error(`STORAGE must be one of ${storageModes.join(', ')}.`);
  // Shared storage is the default whenever it is set up, so every machine using
  // the same database sees the same files.
  return chosen || (env.CLOUDINARY_URL ? 'cloudinary' : databaseUrl ? 'db' : 'disk');
}

export interface NeonLocal {
  fetchEndpoint: string;
  wsProxy: string;
}

export const config = {
  port: Number(env.PORT || 3000),
  serverless,
  databaseUrl,
  poolMax: Number(env.DB_POOL_MAX || (serverless ? 1 : 10)),
  // 'neon' or 'pg'. Default: Neon's serverless driver for neon.tech hosts.
  driver: (env.DB_DRIVER as 'neon' | 'pg' | undefined) || undefined,
  // Test only: send Neon driver traffic to local stand-ins for Neon's proxies.
  neonLocal: env.NEON_FETCH_ENDPOINT
    ? ({ fetchEndpoint: env.NEON_FETCH_ENDPOINT, wsProxy: env.NEON_WS_PROXY || '' } satisfies NeonLocal)
    : undefined,
  // Where uploaded files go: 'cloudinary' (needs CLOUDINARY_URL), 'db' (Postgres) or 'disk' (dataDir).
  storage: storageMode(),
  cloudinary: { url: env.CLOUDINARY_URL || '', apiBase: env.CLOUDINARY_API_BASE || undefined } satisfies CloudinaryConfig,
  // Serverless functions can only write to the system temp folder.
  dataDir: path.resolve(env.DATA_DIR || (serverless ? path.join(os.tmpdir(), 'paperpeer') : path.join(projectRoot, 'data'))),
  // Set SERVE_FRONTEND=1 to serve the built frontend (frontend/dist) from this
  // process, which suits a single-server deployment.
  frontendDir: env.SERVE_FRONTEND === '1' ? path.join(projectRoot, 'frontend', 'dist') : null,
  secureCookies: serverless || env.NODE_ENV === 'production',
  trustProxy: serverless || env.TRUST_PROXY === '1',
};

export type Config = typeof config;
