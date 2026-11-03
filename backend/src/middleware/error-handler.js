import { HttpError } from '../lib/http.js';

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid request.');
  if (err.type === 'entity.too.large') err = new HttpError(413, 'Request is too large.');
  // Postgres unique violation: two requests raced to create the same thing.
  if (err.code === '23505') err = new HttpError(409, 'That already exists.');
  if (!(err instanceof HttpError)) {
    console.error(`${req.method} ${req.path}`, err);
    err = new HttpError(500, 'Something went wrong. Please try again.');
  }
  res.status(err.status).json({ error: err.message });
}
