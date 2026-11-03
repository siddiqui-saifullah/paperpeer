import { HttpError } from '../lib/http.js';

// A cross-site page cannot set a custom header without a CORS preflight, which
// this API never approves. Works alongside the SameSite=Strict cookie.
export function requireApiHeader(req, _res, next) {
  if (!['GET', 'HEAD'].includes(req.method) && req.get('x-requested-with') !== 'paperpeer') {
    throw new HttpError(403, 'Request rejected.');
  }
  next();
}
