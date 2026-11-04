// Vercel entry point: every /api request runs this function. The database
// connection and app are built once per warm instance, then reused.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';

let ready: Promise<Express> | undefined;

function app(): Promise<Express> {
  if (!config.databaseUrl) {
    return Promise.reject(new Error('DATABASE_URL is not set. Add your Neon connection string in the Vercel project settings.'));
  }
  ready ??= openDb(config)
    .then((db) => createApp({ ...config, db }))
    .catch((err: unknown) => {
      ready = undefined; // let the next request retry instead of failing forever
      throw err;
    });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    (await app())(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The server could not reach its database. Try again in a moment.' }));
  }
}
