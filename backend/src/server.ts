import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const db = await openDb(config).catch((err: Error & { code?: string }) => {
  if (!config.databaseUrl) stop(err.message);
  stop(`Could not connect to the database in DATABASE_URL (${err.message || err.code}). Check .env, or leave it empty to use the local database.`);
});
const app = createApp({ ...config, db });

// Express 5 reports a failed listen here, not as a thrown error.
const server = app.listen(config.port, (err?: Error & { code?: string }) => {
  if (err?.code === 'EADDRINUSE') stop(`Port ${config.port} is already in use. Stop the other server, then try again.`);
  if (err) throw err;
  console.log(`PaperPeer API running at http://localhost:${config.port}`);
});

// A clean close lets the database finish writing to disk.
async function shutdown() {
  server.close();
  server.closeAllConnections();
  await db.close();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.once(signal, shutdown);
