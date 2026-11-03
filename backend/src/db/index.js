import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Repos write "?" placeholders; Postgres wants $1, $2. Postgres also refuses NUL
// characters, which can only arrive from a hand-made request.
const toPostgres = (sql) => {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
};
const cleanParam = (value) => (typeof value === 'string' ? value.replaceAll('\0', '') : value);

// A hosted server such as Neon, reached over the network.
async function serverDriver(databaseUrl, poolMax) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: poolMax });
  // Neon closes idle connections when it scales to zero. Unhandled, that would
  // crash the process; the pool simply opens a new connection on the next query.
  pool.on('error', (err) => console.error('Database connection lost:', err.message));
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(fn) {
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
    },
    close: () => pool.end(),
  };
}

const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// PGlite has no lock of its own: a second process opens the same files, sees
// different data and can damage them. A lock left by a killed process is ignored.
function lockEmbedded(dir) {
  const file = `${dir}.lock`;
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
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
async function embeddedDriver(dataDir) {
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
  const querier = (target) => ({
    query: (sql, params) => (params ? target.query(sql, params) : target.exec(sql).then((r) => r.at(-1))),
  });
  return {
    ...querier(pg),
    transaction: (fn) => pg.transaction((t) => fn(querier(t))),
    close: () => pg.close().finally(unlock),
  };
}

export async function openDb({ databaseUrl, dataDir, poolMax = 10 }) {
  const driver = databaseUrl ? await serverDriver(databaseUrl, poolMax) : await embeddedDriver(dataDir);
  // Inside tx(), every query must use that transaction's connection.
  const activeTx = new AsyncLocalStorage();

  const run = (sql, params) => {
    const target = activeTx.getStore() || driver;
    return target.query(toPostgres(sql), params.map(cleanParam));
  };

  const db = {
    prepare: (sql) => ({
      get: async (...params) => (await run(sql, params)).rows[0],
      all: async (...params) => (await run(sql, params)).rows,
      run: async (...params) => {
        const result = await run(sql, params);
        return { changes: result.rowCount ?? result.affectedRows ?? 0 };
      },
    }),
    exec: (sql) => (activeTx.getStore() || driver).query(sql),
    transaction: (fn) => driver.transaction((client) => activeTx.run(client, fn)),
    close: () => driver.close(),
  };
  await migrate(db);
  return db;
}

export const tx = (db, fn) => db.transaction(fn);

// Applies db/migrations/*.sql in filename order. To change the schema, add a new
// numbered file; never edit one that has already shipped.
async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.prepare('SELECT name FROM schema_migrations').all()).map((r) => r.name));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files.filter((f) => !done.has(f))) {
    await tx(db, async () => {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      await db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
  }
}
