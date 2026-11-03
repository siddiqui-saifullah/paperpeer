// Sets the local embedded database aside so a fresh one is created. Nothing is
// deleted: the old folder stays in the data folder under a dated name.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const dir = path.join(config.dataDir, 'pglite');
const lock = `${dir}.lock`;

if (config.databaseUrl) {
  console.log('DATABASE_URL is set, so the local database is not in use. Nothing to do.');
} else if (fs.existsSync(lock) && isRunning(Number(fs.readFileSync(lock, 'utf8')))) {
  console.error('The server is running. Stop it first, then try again.');
  process.exitCode = 1;
} else if (!fs.existsSync(dir)) {
  console.log('There is no local database yet. Nothing to do.');
} else {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  const target = `${dir}-old-${stamp}`;
  fs.renameSync(dir, target);
  fs.rmSync(lock, { force: true });
  console.log(`Old database moved to ${target}`);
  console.log('Run "npm run seed" to add the demo schools again.');
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
