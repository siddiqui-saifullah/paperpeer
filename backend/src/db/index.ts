import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NeonLocal } from '../config.js';
import type { Db } from '../types.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Repos write "?" placeholders; Postgres wants $1, $2. Postgres also refuses NUL
// characters, which can only arrive from a hand-made request.
interface QueryResult {
  rows: any[];
  rowCount?: number | null;
  affectedRows?: number;
}
/** Anything that runs SQL: a pool, one pooled connection, or PGlite. */
interface Querier {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
}
interface Driver extends Querier {
  transaction<T>(fn: (client: Querier) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
interface PoolClientLike extends Querier {
  release(): void;
}
interface PoolLike {
  connect(): Promise<PoolClientLike>;
}

const toPostgres = (sql: string) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};
const cleanParam = (value: unknown) => (typeof value === 'string' ? value.replaceAll('\0', '') : value);

// BEGIN … COMMIT on one connection from a pg-compatible pool.
async function poolTransaction<T>(pool: PoolLike, fn: (client: Querier) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Any Postgres server reached over TCP.
async function serverDriver(databaseUrl: string, poolMax: number): Promise<Driver> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: poolMax });
  // Neon closes idle connections when it scales to zero. Unhandled, that would
  // crash the process; the pool simply opens a new connection on the next query.
  pool.on('error', (err) => console.error('Database connection lost:', err.message));
  return {
    query: (sql, params) => pool.query(sql, params),
    transaction: (fn) => poolTransaction(pool as unknown as PoolLike, fn),
    close: () => pool.end(),
  };
}

// Neon's serverless driver. Single queries go over HTTPS, one request each,
// with no connection to open first: that is what makes cold starts fast.
// Transactions and multi-statement SQL need one session, so they use a
// WebSocket pool, opened only when first needed.
async function neonDriver(databaseUrl: string, poolMax: number, local?: NeonLocal): Promise<Driver> {
  const { neon, neonConfig, Pool } = await import('@neondatabase/serverless');
  if (local) {
    // Only for testing against a local stand-in for Neon's proxies.
    neonConfig.fetchEndpoint = local.fetchEndpoint;
    neonConfig.wsProxy = () => local.wsProxy;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;
  }
  const sql = neon(databaseUrl, { fullResults: true });
  let pool: InstanceType<typeof Pool> | undefined;
  const sessionPool = () => {
    if (!pool) {
      pool = new Pool({ connectionString: databaseUrl, max: poolMax });
      pool.on('error', (err: Error) => console.error('Database connection lost:', err.message));
    }
    return pool;
  };
  return {
    query: async (text, params) =>
      (params ? await sql.query(text, params) : await sessionPool().query(text)) as unknown as QueryResult,
    transaction: (fn) => poolTransaction(sessionPool() as unknown as PoolLike, fn),
    close: async () => {
      await pool?.end();
    },
  };
}

const isNeon = (databaseUrl: string) => {
  try {
    return new URL(databaseUrl).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
};

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// PGlite has no lock of its own: a second process opens the same files, sees
// different data and can damage them. A lock left by a killed process is ignored.
function lockEmbedded(dir: string): () => void {
  const file = `${dir}.lock`;
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const pid = Number(fs.readFileSync(file, 'utf8'));
    if (pid && isRunning(pid)) {
      throw new Error(`The local database is in use by process ${pid}. Stop that server first, then try again.`);
    }
    fs.rmSync(file, { force: true });
    return lockEmbedded(dir);
  }
  const release = () => fs.rmSync(file, { force: true });
  process.once('exit', release);
  return release;
}

// Postgres inside this process, stored in dataDir. For local use and tests, so
// neither needs an account. Only one process can open it at a time.
async function embeddedDriver(dataDir: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = path.join(dataDir, 'pglite');
  fs.mkdirSync(dir, { recursive: true });
  const unlock = lockEmbedded(dir);
  const pg = new PGlite(dir);
  try {
    await pg.waitReady;
  } catch {
    unlock();
    throw new Error('The local database files are damaged and cannot be opened. Run "npm run db:reset" to set them aside and start fresh.');
  }
  // PGlite's query() takes one statement; exec() takes a whole migration file.
  type PgTarget = Pick<typeof pg, 'query' | 'exec'>;
  const querier = (target: PgTarget): Querier => ({
    query: async (sql, params) =>
      (params ? await target.query(sql, params) : (await target.exec(sql)).at(-1) ?? { rows: [] }) as QueryResult,
  });
  return {
    ...querier(pg),
    transaction: (fn) => pg.transaction((t) => fn(querier(t))),
    close: () => pg.close().finally(unlock),
  };
}

interface OpenOptions {
  databaseUrl?: string;
  dataDir: string;
  poolMax?: number;
  driver?: 'neon' | 'pg';
  neonLocal?: NeonLocal;
}


// driver: 'neon' or 'pg'. Default: Neon's driver for neon.tech hosts, pg otherwise.
export async function openDb({ databaseUrl = '', dataDir, poolMax = 10, driver: driverName, neonLocal }: OpenOptions): Promise<Db> {
  const useNeon = driverName ? driverName === 'neon' : isNeon(databaseUrl);
  const driver = !databaseUrl
    ? await embeddedDriver(dataDir)
    : useNeon
      ? await neonDriver(databaseUrl, poolMax, neonLocal)
      : await serverDriver(databaseUrl, poolMax);
  // Inside tx(), every query must use that transaction's connection.
  const activeTx = new AsyncLocalStorage<Querier>();

  const run = (sql: string, params: unknown[]) => {
    const target = activeTx.getStore() || driver;
    return target.query(toPostgres(sql), params.map(cleanParam));
  };

  const db: Db = {
    prepare: (sql) => ({
      get: async (...params: unknown[]) => (await run(sql, params)).rows[0],
      all: async (...params: unknown[]) => (await run(sql, params)).rows,
      run: async (...params: unknown[]) => {
        const result = await run(sql, params);
        return { changes: result.rowCount ?? result.affectedRows ?? 0 };
      },
    }),
    exec: (sql) => (activeTx.getStore() || driver).query(sql),
    transaction: <T>(fn: () => Promise<T>) => driver.transaction((client) => activeTx.run(client, fn)),
    close: () => driver.close(),
  };
  await migrate(db);
  return db;
}

export const tx = <T>(db: Db, fn: () => Promise<T>): Promise<T> => db.transaction(fn);

// Applies db/migrations/*.sql in filename order. To change the schema, add a new
// numbered file; never edit one that has already shipped.
// Serverless hosts can start several instances at once; the advisory lock makes
// them take turns, and each re-reads what is done after it gets the lock.
const MIGRATION_LOCK = 72_411_903;
async function migrate(db: Db): Promise<void> {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  // Usual case on a cold start: everything is applied. One plain query checks
  // that, so no transaction (or Neon WebSocket) is opened just to find out.
  const applied = await db.prepare('SELECT name FROM schema_migrations').all<{ name: string }>().catch(() => null);
  if (applied && files.every((f) => applied.some((r) => r.name === f))) return;
  await tx(db, async () => {
    await db.prepare('SELECT pg_advisory_xact_lock(?)').get(MIGRATION_LOCK);
    await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await db.prepare('SELECT name FROM schema_migrations').all<{ name: string }>()).map((r) => r.name));
    for (const file of files.filter((f) => !done.has(f))) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      await db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    }
  });
}
