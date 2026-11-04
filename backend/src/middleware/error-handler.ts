import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';

interface RawError {
  type?: string;
  code?: string;
}

export function errorHandler(thrown: unknown, req: Request, res: Response, _next: NextFunction) {
  const raw = (thrown ?? {}) as RawError;
  let err: unknown = thrown;
  if (raw.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid request.');
  if (raw.type === 'entity.too.large') err = new HttpError(413, 'Request is too large.');
  // Postgres unique violation: two requests raced to create the same thing.
  if (raw.code === '23505') err = new HttpError(409, 'That already exists.');
  if (!(err instanceof HttpError)) {
    console.error(`${req.method} ${req.path}`, thrown);
    err = new HttpError(500, 'Something went wrong. Please try again.');
  }
  const http = err as HttpError;
  res.status(http.status).json({ error: http.message });
}
