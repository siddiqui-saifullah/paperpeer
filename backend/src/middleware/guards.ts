import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError, forbidden } from '../lib/http.js';
import type { Role, SessionUser } from '../types.js';

export const isStaff = (user: Pick<SessionUser, 'role'>) => user.role === 'admin' || user.role === 'teacher';

/** The logged-in user. Routes behind a guard can rely on it being there. */
export function me(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'Please log in.');
  return req.user;
}

export function requireLogin(req: Request, _res: Response, next: NextFunction) {
  me(req);
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (me(req).must_change_password) throw new HttpError(403, 'Please set a new password first.');
  next();
}

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(me(req).role)) throw forbidden();
    next();
  };

export const staffOnly = [requireUser, requireRole('admin', 'teacher')];
export const adminOnly = [requireUser, requireRole('admin')];
export const studentOnly = [requireUser, requireRole('student')];
