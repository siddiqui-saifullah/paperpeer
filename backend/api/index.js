// Vercel entry point: every /api request runs this function. The database
// connection and app are built once per warm instance, then reused.
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { openDb } from '../src/db/index.js';

let ready;
const app = () => {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Add your Neon connection string in the Vercel project settings.');
  }
  ready ??= openDb(config)
    .then((db) => createApp({ ...config, db }))
    .catch((err) => {
      ready = undefined; // let the next request retry instead of failing forever
      throw err;
    });
  return ready;
};

export default async function handler(req, res) {
  try {
    (await app())(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The server could not reach its database. Try again in a moment.' }));
  }
}
