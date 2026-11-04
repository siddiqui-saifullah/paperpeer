import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';

// A cross-site page cannot set a custom header without a CORS preflight, which
// this API never approves. Works alongside the SameSite=Strict cookie.
export function requireApiHeader(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD'].includes(req.method) && req.get('x-requested-with') !== 'paperpeer') {
    throw new HttpError(403, 'Request rejected.');
  }
  next();
}
